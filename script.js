// @ts-check
/* =======================================================
 * PKP Frontend — Fase 3
 * - Absensi -> Akrual Upah otomatis (ke Payables 'upah' mingguan)
 * - Loan Engine (jadwal cicilan amortisasi)
 * - Monitoring: grafik arus kas 30 hari & pengeluaran per kategori
 * - Tetap kompatibel Fase 1/2
 * ======================================================= */

/**
 * @global {any} firebase
 * @global {any} Chart
 */

document.addEventListener('DOMContentLoaded', () => {
    // ====== Konfigurasi dasar ======
    const OWNER_EMAIL = 'dq060412@gmail.com';
    const TEAM_ID = 'main';
  
    const DEFAULT_POLICY = {
      contingencyTargetPct: 0.07,
      bufferPct: 0.04,
      gatingThresholds: { lt70: 0.5, btw70_90: 0.75, gt90: 1.0 },
      noNewDebtMode: true,
      timezone: 'Asia/Jakarta'
    };
  
    // ===== PASTE CONFIG FIREBASE KAMU =====
    const firebaseConfig = {
      apiKey: "AIzaSyBDTURKKzmhG8hZXlBryoQRdjqd70GI18c",
      authDomain: "banflex-3e7c4.firebaseapp.com",
      projectId: "banflex-3e7c4",
      storageBucket: "banflex-3e7c4.appspot.com",
      messagingSenderId: "192219628345",
      appId: "1:192219628345:web:f1caa28230a5803e681ee8"
    };
  
    // ====== Init Firebase ======
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const auth = firebase.auth();
    db.enablePersistence().catch(()=>{});
  
    // ====== State ======
    /** @type {firebase.User|null} */ let currentUser = null;
    /** @type {'Guest'|'Pending'|'Viewer'|'Editor'|'Admin'|'Owner'} */ let userRole = 'Guest';
    let policy = { ...DEFAULT_POLICY };
  
    // ====== Helpers ======
    const $ = (s)=>document.querySelector(s);
    const $$ = (s)=>Array.from(document.querySelectorAll(s));
    const fmtIDR = (n)=> new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0}).format(Number(n||0));
    const asNum = (v)=> Number(String(v ?? 0).toString().replace(/[^\d.-]/g,'')||0);
    const todayStr = ()=> new Date().toISOString().slice(0,10);
  
    function startOfWeek(d=new Date()){ const dt=new Date(d); const day=(dt.getDay()+6)%7; dt.setDate(dt.getDate()-day); dt.setHours(0,0,0,0); return dt; } // Senin
    function endOfWeek(d=new Date()){ const s=startOfWeek(d); const e=new Date(s); e.setDate(s.getDate()+6); e.setHours(23,59,59,999); return e; }
    function weekKey(d=new Date()){ const s=startOfWeek(d).toISOString().slice(0,10); const e=endOfWeek(d).toISOString().slice(0,10); return `${s}_${e}`; }
  
    let popupTimeout;
    function toast(kind, text){
      clearTimeout(popupTimeout);
      const p = $('#popup-container'); if(!p) return;
      p.className = 'popup-container show popup-'+kind;
      const ic = $('#popup-icon'), msg = $('#popup-message');
      if(ic && msg){ ic.className = (kind==='loading'?'spinner':'material-symbols-outlined'); ic.textContent = kind==='success'?'check_circle':(kind==='error'?'cancel':''); msg.textContent=text; }
      if(kind!=='loading'){ popupTimeout = setTimeout(()=>p.classList.remove('show'),3500); }
    }
    function setConnectionDot(color){ const dot=$('#connection-status .status-dot'); if(!dot) return; dot.classList.remove('online','pending','offline'); dot.classList.add(color==='green'?'online':color==='yellow'?'pending':'offline'); }
  
    // ====== Firestore Refs ======
    const teamRef = db.collection('teams').doc(TEAM_ID);
    const projectsCol = teamRef.collection('projects');
    const envelopesCol = teamRef.collection('fund_envelopes');
    const commitmentsCol = teamRef.collection('commitments');
    const payablesCol = teamRef.collection('payables');
    const entriesCol = teamRef.collection('entries');
    const allocationsCol = teamRef.collection('allocations');
    const loansCol = teamRef.collection('loans');
    const membersCol = teamRef.collection('members');
    const workersCol = teamRef.collection('workers');       // Fase 3
    const attendanceCol = teamRef.collection('attendance'); // Fase 3
  
    // ====== UI wiring ======
    initUI(); ensurePagesInjected();
  
    function initUI(){
      const sidebar=$('#sidebar'), scrim=$('#scrim');
      $('#btnOpenNav')?.addEventListener('click',()=>{sidebar?.classList.add('open');scrim?.classList.add('show');});
      scrim?.addEventListener('click',()=>{sidebar?.classList.remove('open');scrim?.classList.remove('show');});
      // theme
      if(localStorage.getItem('theme')==='dark') document.body.classList.add('dark-theme');
      $('#theme-toggle-btn')?.addEventListener('click',()=>{document.body.classList.toggle('dark-theme');localStorage.setItem('theme',document.body.classList.contains('dark-theme')?'dark':'light');});
      // profile dropdown
      const userBtn=$('#user-profile-btn'), userDd=$('#user-dropdown');
      userBtn?.addEventListener('click',(e)=>{e.stopPropagation();userDd?.classList.toggle('hidden');});
      window.addEventListener('click',(e)=>{ if(userDd && !userDd.contains(e.target) && userBtn && !userBtn.contains(e.target)) userDd.classList.add('hidden'); });
      // nav
      $$('[data-nav]').forEach(btn=>{
        btn.addEventListener('click',()=>{
          const id=btn.getAttribute('data-nav'); showPage(id);
          if(id==='dashboard') renderDashboard();
          if(id==='tagihan') renderPaymentHub();
          if(id==='absensi') renderAbsensiPage();
          if(id==='pengaturan') renderPengaturanPage();
          sidebar?.classList.remove('open'); scrim?.classList.remove('show');
        });
      });
      // auth
      $('#auth-btn')?.addEventListener('click',()=>{ if(currentUser) auth.signOut(); else $('#login-modal')?.classList.remove('hidden'); });
      $('#auth-dropdown-btn')?.addEventListener('click',()=>{ if(currentUser) auth.signOut(); else { $('#user-dropdown')?.classList.add('hidden'); $('#login-modal')?.classList.remove('hidden'); }});
      $('#google-login-btn')?.addEventListener('click', signInWithGoogle);
    }
  
    function ensurePagesInjected(){
      const container = document.querySelector('.page-container'); if(!container) return;
      if(container.querySelector('#page-dashboard')) return;
      container.innerHTML = `
        <main id="page-dashboard" class="page active">
          <div class="section-head">
            <h4>Dashboard Proyek</h4>
            <div class="chips">
              <span class="chip" id="chip-contract">Kontrak: -</span>
              <span class="chip" id="chip-progress">Progres: -</span>
              <span class="chip" id="chip-mode">Tanpa Utang: -</span>
            </div>
          </div>
          <div class="kpi-grid" id="envelope-cards"></div>
          <div class="section-head">
            <h4>Aksi Cepat</h4>
            <div>
              <button id="btn-termin" class="btn btn-primary">Termin Cair</button>
              <button id="btn-payment-hub" class="btn btn-secondary">Payment Hub</button>
            </div>
          </div>
          <div class="charts">
            <div class="card card-pad"><h4 style="margin:0 0 8px 0">Arus Kas 30 Hari</h4><canvas id="cf30"></canvas></div>
            <div class="card card-pad"><h4 style="margin:0 0 8px 0">Pengeluaran per Kategori (30 Hari)</h4><canvas id="cat30"></canvas></div>
          </div>
          <div id="dash-tables" style="margin-top:12px"></div>
        </main>
  
        <main id="page-input-data" class="page"><div class="data-zone"></div></main>
        <main id="page-absensi" class="page"><div class="data-zone"></div></main>
        <main id="page-stok-material" class="page"><div class="data-zone"></div></main>
        <main id="page-tagihan" class="page"><div class="data-zone"></div></main>
        <main id="page-monitoring" class="page"><div class="data-zone"></div></main>
        <main id="page-pengaturan" class="page"><div class="data-zone"></div></main>
      `;
      injectPlannerModal();
      injectPaymentModal();
    }
  
    function showPage(id){
      $$('.page').forEach(p=>p.classList.remove('active'));
      $(`#page-${id}`)?.classList.add('active');
      $$('.nav-item.active').forEach(el=>el.classList.remove('active'));
      $(`.nav-item[data-nav="${id}"]`)?.classList.add('active');
      reflectGuestPlaceholder(id);
    }
  
    function reflectGuestPlaceholder(id){
      const isGuest = !currentUser || userRole==='Pending';
      const container = $(`#page-${id}`); if(!container) return;
      let zone = container.querySelector('.data-zone'); if(!zone){ zone=document.createElement('div'); zone.className='data-zone'; container.appendChild(zone); }
      if(isGuest){
        zone.innerHTML = `
          <div class="card" style="padding:1rem;margin-top:1rem">
            <p><strong>Mode Tamu/Pending</strong></p>
            <p>Data disembunyikan. <button class="btn btn-primary" id="prompt-login-inline">Login untuk melihat data</button></p>
          </div>`;
        $('#prompt-login-inline')?.addEventListener('click',()=>$('#login-modal')?.classList.remove('hidden'));
      }
    }
  
    // ====== Auth ======
    auth.onAuthStateChanged(async (user)=>{
      if(user){
        currentUser = user;
        await ensureMemberDoc(user);
        await loadPolicy();
        await ensureProjectSeed();
        updateHeaderForUser(user);
        setConnectionDot(userRole==='Pending'?'yellow':'green');
        toast('success',`Terhubung sebagai ${user.email}`);
        renderDashboard();
        showPage('dashboard');
      }else{
        currentUser=null; userRole='Guest';
        updateHeaderForUser(null);
        setConnectionDot('red');
        showPage('dashboard');
      }
    });
  
    async function signInWithGoogle(){
      try{
        const provider=new firebase.auth.GoogleAuthProvider();
        await auth.signInWithPopup(provider);
        $('#login-modal')?.classList.add('hidden');
      }catch(e){ console.error(e); toast('error', e?.message||'Gagal login'); }
    }
  
    async function ensureMemberDoc(user){
      const uid=user.uid;
      const memberRef = membersCol.doc(uid);
      const snap = await memberRef.get();
      if(!snap.exists){
        const role = user.email?.toLowerCase()===OWNER_EMAIL ? 'Owner' : 'Pending';
        await memberRef.set({
          uid, email:user.email||'', name:user.displayName||'', photoURL:user.photoURL||'',
          role, createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        userRole = role;
      }else{
        userRole = snap.data().role || 'Pending';
        if(user.email?.toLowerCase()===OWNER_EMAIL && userRole!=='Owner'){
          await memberRef.update({ role:'Owner', updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
          userRole='Owner';
        }
      }
      // policy boot
      const polRef = teamRef.collection('settings').doc('policy');
      const pSnap = await polRef.get();
      if(!pSnap.exists) await polRef.set(DEFAULT_POLICY);
    }
    async function loadPolicy(){
      const polRef = teamRef.collection('settings').doc('policy');
      const pSnap = await polRef.get();
      policy = { ...DEFAULT_POLICY, ...(pSnap.data()||{}) };
    }
    function updateHeaderForUser(user){
      const avatar=$('#user-avatar'), dAva=$('#user-dropdown-avatar'), dName=$('#user-dropdown-name'), dEmail=$('#user-dropdown-email');
      const authBtn=$('#auth-btn'), t=authBtn?.querySelector('.nav-text'), i=authBtn?.querySelector('.material-symbols-outlined');
      if(user){
        const photo=user.photoURL||`https://placehold.co/40x40/3b82f6/ffffff?text=${(user.displayName||'U')[0]}`;
        avatar?.setAttribute('src',photo); dAva?.setAttribute('src',photo.replace('40x40','60x60'));
        if(dName) dName.textContent=user.displayName||'User';
        if(dEmail) dEmail.textContent=user.email||'';
        if(t) t.textContent='Keluar'; if(i) i.textContent='logout'; authBtn?.classList.add('danger');
      }else{
        avatar?.setAttribute('src','https://placehold.co/40x40/e2e8f0/64748b?text=G'); dAva?.setAttribute('src','https://placehold.co/60x60/e2e8f0/64748b?text=G');
        if(dName) dName.textContent='Guest'; if(dEmail) dEmail.textContent='Belum login';
        if(t) t.textContent='Login'; if(i) i.textContent='login'; authBtn?.classList.remove('danger');
      }
    }
  
    // ====== Seed Proyek ======
    async function ensureProjectSeed(){
      if(!currentUser) return;
      const snap = await projectsCol.limit(1).get();
      if(!snap.empty) return;
      if(currentUser.email?.toLowerCase()===OWNER_EMAIL){
        const id = projectsCol.doc().id;
        await projectsCol.doc(id).set({
          projectId:id, name:'Dapur Sehat', contractValue:1420000000, budget:{ total:1420000000 },
          progressPct:0, createdBy:currentUser.uid,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await envelopesCol.doc(id).set({
          projectId:id, operationalBalance:0, contingencyBalance:0, profitLockBalance:0, overheadPoolBalance:0, sinkingFundBalance:0, journalCount:0,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        toast('success','Proyek "Dapur Sehat" dibuat.');
      }
    }
  
    // ====== Planner & Payment (Fase 2 funcs disingkat) ======
    function injectPlannerModal(){
      if($('#alloc-modal')) return;
      const div=document.createElement('div');
      div.innerHTML=`
        <div id="alloc-modal" class="modal-bg hidden">
          <div class="modal-content" style="max-width:720px">
            <div class="modal-header">
              <h4>Allocation Planner — Termin Cair</h4>
              <button class="icon-btn" onclick="document.getElementById('alloc-modal').classList.add('hidden')"><span class="material-symbols-outlined">close</span></button>
            </div>
            <div class="modal-body">
              <div class="form-row"><label>Jumlah Termin Masuk</label><input type="number" id="ap-amount" placeholder="0"/></div>
              <div class="form-row"><label>Tanggal Termin Berikut</label><input type="date" id="ap-nextdate"/></div>
              <div class="helper">Saran otomatis; bisa kamu ubah sebelum simpan.</div>
              <hr style="margin:12px 0;border:none;border-top:1px solid var(--line)" />
              <div class="form-row"><label>Dana Cicilan</label><input type="number" id="ap-sinking"/></div>
              <div class="form-row"><label>Dana s.d. Termin</label><input type="number" id="ap-need"/></div>
              <div class="form-row"><label>Top-up Cadangan</label><input type="number" id="ap-cont-gap"/></div>
              <div class="form-row"><label>Overhead</label><input type="number" id="ap-overhead"/></div>
              <div class="form-row"><label>Laba Kunci</label><input type="number" id="ap-profitlock"/></div>
              <div class="helper" id="ap-hints"></div>
              <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
                <button id="ap-rebalance" class="btn btn-secondary">Auto-Rebalance</button>
                <button id="ap-save" class="btn btn-primary">Simpan Alokasi</button>
              </div>
            </div>
          </div>
        </div>`;
      document.body.appendChild(div.firstElementChild);
    }
    function injectPaymentModal(){
      if($('#pay-modal')) return;
      const div=document.createElement('div');
      div.innerHTML=`
        <div id="pay-modal" class="modal-bg hidden">
          <div class="modal-content" style="max-width:820px">
            <div class="modal-header">
              <h4>Payment Hub</h4>
              <button class="icon-btn" onclick="document.getElementById('pay-modal').classList.add('hidden')"><span class="material-symbols-outlined">close</span></button>
            </div>
            <div class="modal-body" id="pay-modal-body"></div>
          </div>
        </div>`;
      document.body.appendChild(div.firstElementChild);
    }
  
    // ====== Dashboard ======
    async function renderDashboard(){
      const zone = $('#page-dashboard .data-zone');
      if(!zone){ /* noop */ }
      if(!currentUser || userRole==='Pending'){ reflectGuestPlaceholder('dashboard'); return; }
  
      const projSnap = await projectsCol.orderBy('createdAt','asc').limit(1).get();
      if(projSnap.empty){ $('#envelope-cards').innerHTML=''; $('#dash-tables').innerHTML='<div class="card card-pad">Belum ada proyek.</div>'; return; }
      const proj = projSnap.docs[0].data();
      const envSnap = await envelopesCol.doc(proj.projectId).get();
      const env = envSnap.data()||{};
      const entriesTermin = await entriesCol.where('projectId','==',proj.projectId).where('source','==','Termin Proyek').get();
      const terminCollected = entriesTermin.docs.reduce((s,d)=> s + Number(d.data().amount||0), 0);
  
      $('#chip-contract').textContent = `Kontrak: ${fmtIDR(proj.contractValue||0)}`;
      $('#chip-progress').textContent = `Progres: ${(proj.progressPct??0)}%`;
      $('#chip-mode').textContent = `Tanpa Utang: ${policy.noNewDebtMode?'ON':'OFF'}`;
  
      $('#envelope-cards').innerHTML = `
        <div class="kpi-card"><h5>Operasional</h5><div class="amt">${fmtIDR(env.operationalBalance||0)}</div></div>
        <div class="kpi-card"><h5>Cadangan</h5><div class="amt">${fmtIDR(env.contingencyBalance||0)}</div></div>
        <div class="kpi-card"><h5>Laba Kunci</h5><div class="amt">${fmtIDR(env.profitLockBalance||0)}</div></div>
        <div class="kpi-card"><h5>Overhead</h5><div class="amt">${fmtIDR(env.overheadPoolBalance||0)}</div></div>
        <div class="kpi-card"><h5>Dana Cicilan</h5><div class="amt">${fmtIDR(env.sinkingFundBalance||0)}</div></div>
        <div class="kpi-card"><h5>Termin Masuk</h5><div class="amt">${fmtIDR(terminCollected)}</div></div>
      `;
  
      // aksi
      $('#btn-termin')?.addEventListener('click',()=>openAllocationPlanner(proj.projectId));
      $('#btn-payment-hub')?.addEventListener('click',()=>openPaymentHub(proj.projectId));
  
      await renderCashCharts(proj.projectId);
      await renderDueTables(proj.projectId);
    }
  
    async function renderCashCharts(projectId){
      // cashflow 30 hari dari entries (in/out by date)
      const now = new Date(); const start = new Date(); start.setDate(now.getDate()-29); start.setHours(0,0,0,0);
      const entries = await entriesCol.where('projectId','==',projectId).get();
      const byDay = new Map();
      for(let i=0;i<30;i++){ const d=new Date(start); d.setDate(start.getDate()+i); byDay.set(d.toISOString().slice(0,10),0); }
      entries.forEach(doc=>{
        const x=doc.data(); const at=x.at?.toDate?.()||new Date(); const day=at.toISOString().slice(0,10);
        if(!byDay.has(day)) return;
        const val = (x.type==='in'?1:-1)*Number(x.amount||0);
        byDay.set(day, byDay.get(day)+val);
      });
      const labels=[...byDay.keys()];
      const values=[...byDay.values()];
      const cfCtx = document.getElementById('cf30');
      if(cfCtx){
        new Chart(cfCtx,{type:'line',data:{labels,datasets:[{label:'Net (IDR)',data:values}]},options:{responsive:true,plugins:{legend:{display:false}}}});
      }
  
      // kategori pengeluaran 30 hari dari entries->payables.category
      const mapPay = new Map();
      const payDocs = await payablesCol.where('projectId','==',projectId).get();
      payDocs.forEach(d=>{ mapPay.set(d.id, (d.data().category||'lainnya')); });
  
      const spent = {};
      entries.forEach(doc=>{
        const x=doc.data(); if(x.type!=='out') return;
        const at=x.at?.toDate?.()||new Date();
        if(at < start) return;
        const cat = mapPay.get(x.payableId)||'lainnya';
        spent[cat] = (spent[cat]||0) + Number(x.amount||0);
      });
      const cats = Object.keys(spent); const vals = cats.map(c=>spent[c]);
  
      const catCtx = document.getElementById('cat30');
      if(catCtx && cats.length){
        new Chart(catCtx,{type:'bar',data:{labels:cats,datasets:[{label:'Pengeluaran',data:vals}]},options:{responsive:true,plugins:{legend:{display:false}}}});
      }
    }
  
    async function renderDueTables(projectId){
      const now = new Date(); const seven=new Date(); seven.setDate(now.getDate()+7);
      const sevenStr=seven.toISOString().slice(0,10);
  
      const paySnap = await payablesCol.where('projectId','==',projectId).where('status','in',['open','partial']).get();
      const dueSoon=[]; const overdue=[];
      paySnap.forEach(d=>{
        const x=d.data(); const due=(x.dueDate||'').slice(0,10); const bal=Number(x.balance ?? x.amount ?? 0);
        if(bal<=0 || !due) return;
        if(due < todayStr()) overdue.push({id:d.id,...x});
        else if(due <= sevenStr) dueSoon.push({id:d.id,...x});
      });
  
      $('#dash-tables').innerHTML = `
        <div class="section-head"><h4>Tagihan Mendesak (≤7 hari)</h4></div>
        <div class="card card-pad">
          <table class="table"><thead><tr><th>Jenis</th><th>Jatuh Tempo</th><th>Sisa</th><th></th></tr></thead>
          <tbody>
            ${dueSoon.map(x=>`
              <tr>
                <td>${x.category||'-'} — ${x.vendor||x.desc||'-'}</td>
                <td>${(x.dueDate||'').slice(0,10)}</td>
                <td>${fmtIDR(Number(x.balance ?? x.amount ?? 0))}</td>
                <td><button class="btn btn-secondary" data-pay-id="${x.id}">Bayar</button></td>
              </tr>
            `).join('') || `<tr><td colspan="4">Tidak ada.</td></tr>`}
          </tbody></table>
        </div>
  
        <div class="section-head"><h4>Tagihan Terlambat</h4></div>
        <div class="card card-pad">
          <table class="table"><thead><tr><th>Jenis</th><th>Jatuh Tempo</th><th>Sisa</th><th></th></tr></thead>
          <tbody>
            ${overdue.map(x=>`
              <tr>
                <td>${x.category||'-'} — ${x.vendor||x.desc||'-'}</td>
                <td class="text-danger">${(x.dueDate||'').slice(0,10)}</td>
                <td>${fmtIDR(Number(x.balance ?? x.amount ?? 0))}</td>
                <td><button class="btn btn-secondary" data-pay-id="${x.id}">Bayar</button></td>
              </tr>
            `).join('') || `<tr><td colspan="4">Tidak ada.</td></tr>`}
          </tbody></table>
        </div>
      `;
      $$('#dash-tables [data-pay-id]').forEach(btn=>{
        btn.addEventListener('click', async ()=>{
          const projId = (await projectsCol.orderBy('createdAt','asc').limit(1).get()).docs[0].id;
          openPaymentHub(projId, btn.getAttribute('data-pay-id'));
        });
      });
    }
  
    // ====== Planner (reuse Fase 2 core) ======
    async function openAllocationPlanner(projectId){
      guardAuthOrThrow();
      const modal=$('#alloc-modal'); if(!modal) return;
      const fields=['ap-amount','ap-nextdate','ap-sinking','ap-need','ap-cont-gap','ap-overhead','ap-profitlock'];
      fields.forEach(id=>{ const el=/**@type {HTMLInputElement}*/(document.getElementById(id)); if(el) el.value='';});
      $('#ap-hints').textContent='';
  
      const onRecalc = async ()=>{
        const amountIn=asNum($('#ap-amount').value);
        const nextDate=$('#ap-nextdate').value || todayStr();
        if(!amountIn){ $('#ap-hints').textContent='Masukkan jumlah termin.'; return; }
        const sug = await suggestAllocation(projectId, amountIn, nextDate);
        $('#ap-sinking').value=String(Math.floor(sug.sinkingFund||0));
        $('#ap-need').value=String(Math.floor(sug.needUntilNextTerm||0));
        $('#ap-cont-gap').value=String(Math.floor(sug.contingencyTopUp||0));
        $('#ap-overhead').value=String(Math.floor(sug.allowedOverhead||0));
        const leftover = Math.max(0, amountIn - (asNum($('#ap-sinking').value)+asNum($('#ap-need').value)+asNum($('#ap-cont-gap').value)+asNum($('#ap-overhead').value)));
        $('#ap-profitlock').value=String(leftover);
        $('#ap-hints').innerHTML = `CRM: <b>${fmtIDR(sug.crm)}</b>, Allowed Overhead: <b>${fmtIDR(sug.allowedOverhead)}</b>`;
      };
      $('#ap-amount').oninput=onRecalc; $('#ap-nextdate').onchange=onRecalc; $('#ap-rebalance').onclick=onRecalc;
  
      $('#ap-save').onclick = async ()=>{
        const amountIn=asNum($('#ap-amount').value);
        const nextDate=$('#ap-nextdate').value || todayStr();
        const alloc={ sinking:asNum($('#ap-sinking').value), need:asNum($('#ap-need').value), contGap:asNum($('#ap-cont-gap').value), overhead:asNum($('#ap-overhead').value), profitlock:asNum($('#ap-profitlock').value) };
        const sum=alloc.sinking+alloc.need+alloc.contGap+alloc.overhead+alloc.profitlock;
        if(sum!==amountIn) alloc.profitlock += (amountIn-sum);
        const check = await simulateSafety(projectId, alloc, amountIn);
        if(policy.noNewDebtMode && !check.safe){ toast('error','No-New-Debt Mode: alokasi belum aman.'); return; }
        await saveAllocation(projectId, amountIn, nextDate, alloc);
        toast('success','Alokasi tersimpan.');
        $('#alloc-modal').classList.add('hidden'); renderDashboard();
      };
  
      modal.classList.remove('hidden');
    }
    async function suggestAllocation(projectId, amountIn, nextDateStr){
      const proj = (await projectsCol.doc(projectId).get()).data()||{};
      const env  = (await envelopesCol.doc(projectId).get()).data()||{};
      const terminSnap = await entriesCol.where('projectId','==',projectId).where('source','==','Termin Proyek').get();
      const terminCollected = terminSnap.docs.reduce((s,d)=> s + Number(d.data().amount||0), 0) + Number(amountIn||0);
      const outSnap = await entriesCol.where('projectId','==',projectId).where('type','==','out').get();
      const actualOut = outSnap.docs.reduce((s,d)=> s + Number(d.data().amount||0), 0);
  
      const need = await sumPayablesDueBy(projectId, nextDateStr);
      const buffer = Math.round((proj.contractValue||0)*(policy.bufferPct||0));
      const needUntilNextTerm = need + buffer;
  
      const contTarget = Math.round((proj.contractValue||0)*(policy.contingencyTargetPct||0));
      const contGap = Math.max(0, contTarget - Number(env.contingencyBalance||0));
      const sinking = await sumLoanDueBy(projectId, nextDateStr);
  
      const crm = terminCollected - actualOut - needUntilNextTerm - contGap;
      const prog = Number(proj.progressPct||0);
      let gatePct = policy.gatingThresholds.lt70;
      if(prog>=70 && prog<90) gatePct=policy.gatingThresholds.btw70_90;
      else if(prog>=90) gatePct=policy.gatingThresholds.gt90;
  
      let allowedOverhead = Math.max(0, Math.floor(crm*gatePct));
      allowedOverhead = Math.min(allowedOverhead, Math.max(0, amountIn - (sinking + needUntilNextTerm + contGap)));
      const safe = (Number(env.operationalBalance||0) + (amountIn - (sinking + contGap + allowedOverhead))) >= needUntilNextTerm;
      return { sinkingFund:sinking, needUntilNextTerm, contingencyTopUp:contGap, crm, allowedOverhead, safe };
    }
    async function simulateSafety(projectId, alloc, amountIn){
      const env=(await envelopesCol.doc(projectId).get()).data()||{};
      const projectedOperational = Number(env.operationalBalance||0) + (amountIn - (alloc.sinking + alloc.contGap + alloc.overhead + alloc.profitlock));
      return { safe: projectedOperational >= alloc.need, projectedOperational };
    }
    async function saveAllocation(projectId, amountIn, nextDateStr, alloc){
      const envRef=envelopesCol.doc(projectId);
      const jrnlRef=envRef.collection('journal').doc();
      const allocRef=allocationsCol.doc();
      await db.runTransaction(async (tx)=>{
        const env=(await tx.get(envRef)).data()||{};
        const now=firebase.firestore.FieldValue.serverTimestamp();
        tx.update(envRef,{
          operationalBalance:Number(env.operationalBalance||0)+(amountIn-(alloc.sinking+alloc.contGap+alloc.overhead+alloc.profitlock)),
          contingencyBalance:Number(env.contingencyBalance||0)+alloc.contGap,
          profitLockBalance:Number(env.profitLockBalance||0)+alloc.profitlock,
          overheadPoolBalance:Number(env.overheadPoolBalance||0)+alloc.overhead,
          sinkingFundBalance:Number(env.sinkingFundBalance||0)+alloc.sinking,
          journalCount:Number(env.journalCount||0)+1,updatedAt:now
        });
        tx.set(jrnlRef,{type:'termin_allocation_v2',amountIn,nextDate:nextDateStr,allocate:alloc,at:now,by:currentUser?.uid||''});
        tx.set(allocRef,{projectId,amountIn,nextTermDate:nextDateStr,allocate:alloc,policySnapshot:policy,createdAt:now,by:currentUser?.uid||''});
      });
      await entriesCol.add({projectId,type:'in',source:'Termin Proyek',amount:Number(amountIn||0),at:firebase.firestore.FieldValue.serverTimestamp(),by:currentUser?.uid||''});
    }
    async function sumPayablesDueBy(projectId,dateStr){
      const snap=await payablesCol.where('projectId','==',projectId).where('status','in',['open','partial']).get();
      let sum=0; snap.forEach(d=>{const x=d.data(); const bal=Number(x.balance ?? x.amount ?? 0); const due=(x.dueDate||'').slice(0,10); if(bal>0 && due && due<=dateStr) sum+=bal;}); return sum;
    }
    async function sumLoanDueBy(projectId,dateStr){
      const snap=await loansCol.where('projectId','==',projectId).get(); let sum=0;
      snap.forEach(d=>{ const x=d.data(); const sched=Array.isArray(x.schedule)?x.schedule:[]; sched.forEach(s=>{const due=(s.dueDate||'').slice(0,10); if(due && due<=dateStr) sum += Number(s.amount||0)-Number(s.paid||0);});});
      return sum;
    }
  
    // ====== Payment Hub ======
    async function openPaymentHub(projectId,focusPayableId){ guardAuthOrThrow(); await renderPaymentHub(projectId,focusPayableId); $('#pay-modal')?.classList.remove('hidden'); }
    async function renderPaymentHub(projectId, focusPayableId){
      const zoneModal=$('#pay-modal-body'); const zonePage=$('#page-tagihan .data-zone'); const zone=zoneModal||zonePage; if(!zone) return;
      const snap=await payablesCol.where('projectId','==',projectId).where('status','in',['open','partial']).orderBy('dueDate','asc').get();
      const rows=snap.docs.map(d=>{const x=d.data(); const bal=Number(x.balance ?? x.amount ?? 0);
        return `<tr>
          <td>${(x.category||'-').toUpperCase()} — ${x.vendor||x.desc||'-'}</td>
          <td>${(x.dueDate||'').slice(0,10)}</td>
          <td>${fmtIDR(bal)}</td>
          <td style="display:flex;gap:6px">
            <input type="number" min="0" max="${bal}" value="${bal}" data-pay-amt="${d.id}" style="width:140px;padding:6px;border:1px solid var(--line);border-radius:8px" />
            <button class="btn btn-primary" data-pay-go="${d.id}">Bayar</button>
          </td>
        </tr>`;}).join('');
      zone.innerHTML = `
        <div class="section-head"><h4>Daftar Tagihan</h4></div>
        <div class="card card-pad">
          <table class="table">
            <thead><tr><th>Tagihan</th><th>Jatuh Tempo</th><th>Sisa</th><th>Aksi</th></tr></thead>
            <tbody>${rows || `<tr><td colspan="4">Tidak ada tagihan terbuka.</td></tr>`}</tbody>
          </table>
        </div>
      `;
      if(focusPayableId){ const el=zone.querySelector(`[data-pay-amt="${focusPayableId}"]`); el?.scrollIntoView({behavior:'smooth',block:'center'}); el?.classList.add('highlight'); setTimeout(()=>el?.classList.remove('highlight'),1200); }
      $$('#pay-modal-body [data-pay-go], #page-tagihan [data-pay-go]').forEach(btn=>{
        btn.addEventListener('click', async ()=>{
          const id=btn.getAttribute('data-pay-go'); const inp=zone.querySelector(`[data-pay-amt="${id}"]`); const amt=asNum(inp?.value);
          try{ await handlePay(projectId,id,amt); toast('success','Pembayaran tercatat.'); renderPaymentHub(projectId); renderDashboard(); }catch(e){ toast('error', e?.message||'Gagal membayar.'); }
        });
      });
    }
    async function handlePay(projectId, payableId, amount){
      guardAuthOrThrow(); if(amount<=0) throw new Error('Nilai pembayaran tidak valid.');
      const combo = await canProceedPayment({projectId,amount}); if(!combo.ok) throw new Error((combo.issues||[]).join(' '));
      const payRef=payablesCol.doc(payableId); const envRef=envelopesCol.doc(projectId);
      await db.runTransaction(async (tx)=>{
        const paySnap=await tx.get(payRef); if(!paySnap.exists) throw new Error('Tagihan tidak ditemukan.');
        const p=paySnap.data()||{}; const bal=Number(p.balance ?? p.amount ?? 0); if(bal<=0) throw new Error('Tagihan sudah lunas.');
        const payAmt=Math.min(amount,bal);
        const env=(await tx.get(envRef)).data()||{}; const oper=Number(env.operationalBalance||0); if(oper<payAmt) throw new Error('Saldo operasional tidak cukup.');
        const now=firebase.firestore.FieldValue.serverTimestamp();
        tx.update(envRef,{operationalBalance:oper-payAmt,updatedAt:now});
        const newBal=bal-payAmt; tx.update(payRef,{balance:newBal,status:newBal<=0?'paid':'partial',updatedAt:now});
        tx.set(entriesCol.doc(),{projectId,type:'out',source:'Pembayaran Tagihan',payableId,amount:payAmt,at:now,by:currentUser?.uid||''});
      });
    }
    async function budgetGuard(projectId, amount){
      const projSnap=await projectsCol.doc(projectId).get(); const budget=Number(projSnap.data()?.budget?.total||0);
      const commSnap=await commitmentsCol.where('projectId','==',projectId).get();
      const commitments=commSnap.docs.reduce((s,d)=>s+Number(d.data().amount||0),0);
      const paidSnap=await payablesCol.where('projectId','==',projectId).where('status','in',['partial','paid']).get();
      const actual=paidSnap.docs.reduce((s,d)=>s+(Number(d.data().amount||0)-Number(d.data().balance||0)),0);
      const available=budget-commitments-actual;
      return { ok:available>=amount, available, budget, commitments, actual };
    }
    async function envelopeGuard(projectId, amount){
      const env=(await envelopesCol.doc(projectId).get()).data()||{}; const operational=Number(env.operationalBalance||0);
      return { ok: operational>=amount, available:operational };
    }
    async function canProceedPayment({projectId,amount}){
      const [bg,eg]=await Promise.all([budgetGuard(projectId,amount), envelopeGuard(projectId,amount)]);
      const issues=[]; if(!bg.ok) issues.push(`Sisa anggaran tidak cukup (tersedia ${fmtIDR(bg.available)}).`);
      if(!eg.ok) issues.push(`Saldo operasional tidak cukup.`);
      return { ok: bg.ok && eg.ok, issues };
    }
    function guardAuthOrThrow(){ if(!currentUser) throw new Error('Harus login.'); if(userRole==='Pending') throw new Error('Akun menunggu persetujuan.'); }
  
    // ====== ABSENSI -> AKRUAL UPAH (baru) ======
    async function renderAbsensiPage(){
      const zone = $('#page-absensi .data-zone'); if(!zone) return;
      if(!currentUser || userRole==='Pending'){ reflectGuestPlaceholder('absensi'); return; }
  
      // Pastikan ada proyek aktif
      const projSnap = await projectsCol.orderBy('createdAt','asc').limit(1).get();
      if(projSnap.empty){ zone.innerHTML = '<div class="card card-pad">Belum ada proyek.</div>'; return; }
      const projectId = projSnap.docs[0].id;
  
      // Ambil daftar pekerja
      const wkSnap = await workersCol.orderBy('name','asc').get();
      const workers = wkSnap.docs.map(d=>({id:d.id, ...d.data()}));
  
      zone.innerHTML = `
        <div class="section-head">
          <h4>Absensi & Akrual Upah</h4>
          <div class="chips"><span class="chip">${todayStr()}</span></div>
        </div>
        <div class="card card-pad">
          <div class="absensi-grid" id="absensi-grid"></div>
        </div>
      `;
  
      const grid = $('#absensi-grid');
      grid.innerHTML = workers.map(w=>`
        <div class="worker-card" data-worker="${w.id}">
          <h5>${w.name||'-'}</h5>
          <div class="badge">Rate Harian: ${fmtIDR(Number(w.wage?.daily||0))}</div>
          <div class="btn-group" style="margin-top:8px">
            <button class="btn-xs" data-att="full">Hadir</button>
            <button class="btn-xs" data-att="half">½ Hari</button>
            <button class="btn-xs" data-att="absent">Absen</button>
            <button class="btn-xs" data-att="ot">+ Lembur</button>
          </div>
        </div>
      `).join('');
  
      // binding
      $$('#absensi-grid .worker-card').forEach(card=>{
        const wid = card.getAttribute('data-worker');
        card.querySelectorAll('[data-att]').forEach(btn=>{
          btn.addEventListener('click', async ()=>{
            const type = btn.getAttribute('data-att');
            try{
              if(type==='ot'){
                const jam = prompt('Jam lembur? (angka)'); const hours = Number(jam||0)||0; await markAttendanceAndAccrue(projectId, wid, 'overtime', {hours});
              }else{
                await markAttendanceAndAccrue(projectId, wid, type);
              }
              btn.classList.add('highlight'); setTimeout(()=>btn.classList.remove('highlight'),800);
            }catch(e){ toast('error', e?.message||'Gagal mencatat absensi'); }
          });
        });
      });
    }
  
    async function markAttendanceAndAccrue(projectId, workerId, status, extra={}){
      guardAuthOrThrow();
      // 1) create attendance record
      const today = todayStr();
      const atRef = attendanceCol.doc(`${workerId}_${today}`);
      const wk = (await workersCol.doc(workerId).get()).data()||{};
      const rateDaily = Number(wk.wage?.daily||0);
      const rateHalf  = Number(wk.wage?.half || Math.round(rateDaily*0.6));
      const otPerHour = Number(wk.wage?.otPerHour || Math.round(rateDaily/8));
  
      let amount = 0;
      if(status==='full') amount = rateDaily;
      else if(status==='half') amount = rateHalf;
      else if(status==='overtime') amount = (Number(extra.hours||0) * otPerHour);
      else amount = 0;
  
      await atRef.set({
        projectId, workerId, date: today, status, hours: Number(extra.hours||0) || 0,
        amount, createdAt: firebase.firestore.FieldValue.serverTimestamp(), by: currentUser?.uid||''
      });
  
      // 2) upsert payable "upah" minggu berjalan
      if(amount>0){
        await upsertWagePayable(projectId, workerId, amount);
        toast('success','Absensi terekam & upah terakru.');
      }else{
        toast('success','Absensi terekam.');
      }
    }
  
    async function upsertWagePayable(projectId, workerId, addAmount){
      const wk = (await workersCol.doc(workerId).get()).data()||{};
      const wkName = wk.name || 'Pekerja';
      const wkRole = wk.role || 'Pekerja';
      const wkPeriod = weekKey(new Date());
      const [start,end] = wkPeriod.split('_');
  
      // cari payable upah periode ini
      const snap = await payablesCol
        .where('projectId','==',projectId)
        .where('category','==','upah')
        .where('workerId','==',workerId)
        .where('period','==',wkPeriod)
        .limit(1).get();
  
      const due = new Date(end); due.setDate(due.getDate()+2);
      const dueStr = due.toISOString().slice(0,10);
  
      if(snap.empty){
        await payablesCol.add({
          projectId,
          category:'upah',
          workerId,
          vendor: wkName,
          desc: `Upah ${wkRole} (${start}—${end})`,
          amount: Number(addAmount||0),
          balance: Number(addAmount||0),
          status:'open',
          dueDate: dueStr,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }else{
        const ref=snap.docs[0].ref;
        await db.runTransaction(async (tx)=>{
          const cur=(await tx.get(ref)).data()||{};
          const newAmt=Number(cur.amount||0)+Number(addAmount||0);
          const newBal=Number(cur.balance||0)+Number(addAmount||0);
          tx.update(ref,{amount:newAmt,balance:newBal,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
        });
      }
    }
  
    // ====== PENGATURAN: Loan Engine (form sederhana) ======
    async function renderPengaturanPage(){
      const zone = $('#page-pengaturan .data-zone'); if(!zone) return;
      if(!currentUser || userRole==='Pending'){ reflectGuestPlaceholder('pengaturan'); return; }
  
      // Proyek aktif
      const projSnap = await projectsCol.orderBy('createdAt','asc').limit(1).get();
      if(projSnap.empty){ zone.innerHTML = '<div class="card card-pad">Belum ada proyek.</div>'; return; }
      const projectId = projSnap.docs[0].id;
  
      zone.innerHTML = `
        <div class="section-head"><h4>Pengaturan Tim & Pembiayaan</h4></div>
  
        <div class="card card-pad" style="margin-bottom:12px">
          <h4 style="margin:0 0 8px 0">Tambah Pinjaman (Loan)</h4>
          <div class="form-row"><label>Nama Lender</label><input id="loan-lender" placeholder="PT Dana Mitra"/></div>
          <div class="form-row"><label>Pokok Pinjaman</label><input id="loan-principal" type="number" placeholder="0"/></div>
          <div class="form-row"><label>Bunga % per tahun</label><input id="loan-rate" type="number" step="0.01" placeholder="12"/></div>
          <div class="form-row"><label>Tenor (bulan)</label><input id="loan-tenor" type="number" placeholder="6"/></div>
          <div class="form-row"><label>Tanggal Mulai</label><input id="loan-start" type="date" value="${todayStr()}"/></div>
          <div class="helper">Skema: amortisasi bulanan (angsuran tetap). Jadwal cicilan akan dibuat otomatis.</div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
            <button class="btn btn-primary" id="loan-create">Buat Loan</button>
          </div>
        </div>
  
        <div class="card card-pad">
          <h4 style="margin:0 0 8px 0">Daftar Loan</h4>
          <div id="loan-list"></div>
        </div>
      `;
  
      $('#loan-create')?.addEventListener('click', async ()=>{
        try{
          const lender=$('#loan-lender').value?.trim()||'Lender';
          const principal=asNum($('#loan-principal').value);
          const rate=Number($('#loan-rate').value||0)/100;
          const tenor=Number($('#loan-tenor').value||0);
          const start=$('#loan-start').value||todayStr();
          if(principal<=0 || tenor<=0) { toast('error','Pokok/tenor tidak valid.'); return; }
          await createLoan(projectId,{lender,principal,rate,tenor,startDate:start});
          toast('success','Loan dibuat.');
          renderPengaturanPage();
        }catch(e){ toast('error', e?.message||'Gagal membuat loan'); }
      });
  
      // list loans
      const ls = await loansCol.where('projectId','==',projectId).get();
      $('#loan-list').innerHTML = ls.docs.map(d=>{
        const x=d.data(); const total=x.schedule?.reduce((s,v)=>s+Number(v.amount||0),0)||0;
        return `<div class="card card-pad" style="margin:8px 0">
          <div><strong>${x.lender}</strong> — Pokok ${fmtIDR(x.principal)} | ${x.rate*100}% p.a. | Tenor ${x.tenor} bln</div>
          <div>Total jadwal: ${fmtIDR(total)}</div>
        </div>`;
      }).join('') || 'Belum ada.';
    }
  
    async function createLoan(projectId,{lender,principal,rate,tenor,startDate}){
      // amortisasi (angsuran tetap)
      const i = rate/12;
      const n = tenor;
      const A = i===0 ? (principal/n) : (principal * (i*Math.pow(1+i,n)) / (Math.pow(1+i,n)-1));
      const schedule=[];
      let balance=principal; let cur=new Date(startDate+'T00:00:00');
      for(let k=1;k<=n;k++){
        const interest = balance * i;
        const principalPay = A - interest;
        balance = Math.max(0, balance - principalPay);
        const due = new Date(cur); due.setMonth(cur.getMonth() + (k-1));
        schedule.push({ idx:k, dueDate: due.toISOString().slice(0,10), amount: Math.round(A), paid: 0 });
      }
      await loansCol.add({
        projectId, lender, principal:Math.round(principal), rate, tenor,
        startDate, schedule,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  
    // ====== Expose (opsional) ======
    window.PKP = { openAllocationPlanner, renderPaymentHub, handlePay };
  
  });
  