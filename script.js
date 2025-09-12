// @ts-check
/* =======================================================
 * PKP Frontend — v4.2 (Payment Hub + Approval Center + Export)
 * ======================================================= */

document.addEventListener('DOMContentLoaded', () => {
    const OWNER_EMAIL = 'dq060412@gmail.com';
    const TEAM_ID = 'main';
  
    // ===== FIREBASE CONFIG =====
    const firebaseConfig = {
      apiKey: "AIzaSyBDTURKKzmhG8hZXlBryoQRdjqd70GI18c",
      authDomain: "banflex-3e7c4.firebaseapp.com",
      projectId: "banflex-3e7c4",
      storageBucket: "banflex-3e7c4.appspot.com",
      messagingSenderId: "192219628345",
      appId: "1:192219628345:web:f1caa28230a5803e681ee8"
    };
  
    // ===== Init Firebase =====
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const auth = firebase.auth();
    db.enablePersistence().catch(()=>{});
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(()=>{});
  
    // ===== State =====
    let currentUser = null;
    /** @type {'Guest'|'Pending'|'Viewer'|'Editor'|'Admin'|'Owner'} */
    let userRole = 'Guest';
  
    // ===== Refs =====
    const teamRef = db.collection('teams').doc(TEAM_ID);
    const membersCol = teamRef.collection('members');
    const projectsCol = teamRef.collection('projects');
    const envelopesCol = teamRef.collection('fund_envelopes');
    const payablesCol = teamRef.collection('payables');          // Tagihan
    const entriesCol = teamRef.collection('entries');            // Jurnal ringan
    const workersCol = teamRef.collection('workers');
    const attendanceCol = teamRef.collection('attendance');
    const changeRequestsCol = teamRef.collection('change_requests');
  
    // ===== Helpers =====
    const $  = (s) => document.querySelector(s);
    const $$ = (s) => Array.from(document.querySelectorAll(s));
    const fmtIDR = (n)=> new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0}).format(Number(n||0));
    const todayStr = ()=> new Date().toISOString().slice(0,10);
    const asNum = (v)=> Number(String(v ?? 0).toString().replace(/[^\d.-]/g,'')||0);
    const isMobileLike = () => /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;
    const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
    const sleep = (ms)=> new Promise(r=>setTimeout(r,ms));

    function applyRoleVisibility() {
        // 1) Tandai body untuk styling kondisional
        document.body.dataset.role = userRole; // e.g. data-role="Owner"
      
        // 2) Show/hide item yang punya data-role (jika kamu masih pakai gate di sidebar)
        document.querySelectorAll('[data-role]').forEach(el => {
          const roles = String(el.getAttribute('data-role') || '')
            .split(',').map(s => s.trim());
          el.style.display = (roles.includes(userRole) || userRole === 'Owner') ? '' : 'none';
        });
      
        // 3) Placeholder konten hanya jika Guest/Pending
        const active = document.querySelector('.page.active')?.id?.replace('page-','') || 'dashboard';
        if (!currentUser || userRole === 'Pending') {
          reflectGuestPlaceholder(active);
        } else {
          const zone = document.querySelector(`#page-${active} .data-zone`);
          if (zone && zone.firstElementChild?.classList.contains('placeholder-card')) {
            zone.innerHTML = ''; // kosongkan placeholder
          }
        }
      
        // 4) Perbarui tombol login/keluar di footer sidebar
        const authBtn = document.getElementById('auth-btn');
        if (authBtn) {
          const textSpan = authBtn.querySelector('.nav-text');
          const iconSpan = authBtn.querySelector('.material-symbols-outlined');
          if (currentUser) {
            textSpan && (textSpan.textContent = 'Keluar');
            iconSpan && (iconSpan.textContent = 'logout');
            authBtn.classList.add('danger');
          } else {
            textSpan && (textSpan.textContent = 'Login');
            iconSpan && (iconSpan.textContent = 'login');
            authBtn.classList.remove('danger');
          }
        }
      }
      
  
    // Toast
    let popupTimeout;
    function toast(kind, text){
      clearTimeout(popupTimeout);
      const p = $('#popup-container'); if(!p) return;
      p.className = 'popup-container show popup-' + kind;
      const iconEl = $('#popup-icon'); const messageEl = $('#popup-message');
      if(iconEl && messageEl){
        iconEl.className = kind === 'loading' ? 'spinner' : 'material-symbols-outlined';
        iconEl.textContent = kind === 'success' ? 'check_circle' : (kind === 'error' ? 'cancel' : '');
        messageEl.textContent = text;
      }
      if(kind !== 'loading'){
        popupTimeout = setTimeout(() => p.classList.remove('show'), 2800);
      }
    }
    function setConnectionDot(color){ // green|yellow|red
      const dot = $('#connection-status .status-dot'); if(!dot) return;
      dot.classList.remove('online','pending','offline');
      dot.classList.add(color === 'green' ? 'online' : color === 'yellow' ? 'pending' : 'offline');
    }
    function lockScroll(lock){ document.body.classList.toggle('modal-open', !!lock); }
  
    // UI Boot
    wireUI();
    ensurePagesInjected();
    showPage('dashboard');
    reflectGuestPlaceholder('dashboard');
  
    function wireUI(){
      // Sidebar
      const sidebar = $('#sidebar'), scrim = $('#scrim');
      $('#btnOpenNav')?.addEventListener('click', ()=>{ sidebar?.classList.add('open'); scrim?.classList.add('show'); });
      scrim?.addEventListener('click', ()=>{ sidebar?.classList.remove('open'); scrim?.classList.remove('show'); });
  
      // Theme
      if(localStorage.getItem('theme') === 'dark') document.body.classList.add('dark-theme');
      $('#theme-toggle-btn')?.addEventListener('click', ()=>{
        document.body.classList.toggle('dark-theme');
        localStorage.setItem('theme', document.body.classList.contains('dark-theme') ? 'dark':'light');
      });
  
      // User dropdown
      const userBtn = $('#user-profile-btn'), userDd = $('#user-dropdown');
      userBtn?.addEventListener('click', (e)=>{ e.stopPropagation(); userDd?.classList.toggle('hidden'); });
      window.addEventListener('click', (e)=>{ if(userDd && !userDd.contains(e.target) && userBtn && !userBtn.contains(e.target)) userDd.classList.add('hidden'); });
  
      // Global Search
      const searchBtn = $('#global-search-btn');
      const searchWrap = $('#global-search-container');
      const searchInput = $('#global-search-input');
      searchBtn?.addEventListener('click', ()=>{
        searchWrap?.classList.toggle('active');
        if(searchWrap?.classList.contains('active')) { searchWrap.classList.remove('hidden'); searchInput?.focus(); }
        else { searchWrap?.classList.add('hidden'); }
      });
      searchInput?.addEventListener('keydown', (e)=>{
        if(e.key === 'Enter'){
          const q = (searchInput.value||'').trim().toLowerCase();
          const map = { dashboard:'dashboard', tagihan:'tagihan', absensi:'absensi', pengaturan:'pengaturan', laporan:'monitoring', material:'stok-material', input:'input-data' };
          if(map[q]) { showPage(map[q]); toast('success', `Pindah ke ${q}`); renderIfNeeded(map[q]); }
          else { toast('error','Menu tidak dikenali'); }
        }
      });
  
      // Auth
      $('#auth-btn')?.addEventListener('click', ()=>{ if(currentUser) auth.signOut(); else openLoginModal(); });
      $('#auth-dropdown-btn')?.addEventListener('click', ()=>{ if(currentUser) auth.signOut(); else { $('#user-dropdown')?.classList.add('hidden'); openLoginModal(); }});
      $('#google-login-btn')?.addEventListener('click', signInWithGoogle);
  
      // Nav
      $$('[data-nav]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const id = btn.getAttribute('data-nav');
          showPage(id);
          reflectGuestPlaceholder(id);
          renderIfNeeded(id);
        });
      });
  
      // Modal close by backdrop
      document.body.addEventListener('click', (e)=>{
        const t = e.target;
        if(t?.matches?.('.modal-bg')){ t.classList.add('hidden'); t.remove(); lockScroll(false); }
      });
    }
  
    function renderIfNeeded(id){
      if(id==='dashboard') initDashboardLight();
      if(id==='tagihan') renderTagihanTable();
      if(id==='pengaturan') renderApprovalCenter();
    }
  
    function openLoginModal(){
      $('#login-modal')?.classList.remove('hidden');
      lockScroll(true);
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
            </div>
          </div>
          <div class="kpi-grid" id="envelope-cards"></div>
          <div class="card card-pad responsive-info">
            <p>Gunakan menu di kiri. Mode tamu menampilkan placeholder hingga Anda login.</p>
            <div class="mt8">
              <button class="btn btn-secondary" id="btn-export-dash">Export Snapshot</button>
            </div>
          </div>
        </main>
  
        <main id="page-input-data" class="page">
          <div class="data-zone"></div>
        </main>
  
        <main id="page-absensi" class="page">
          <div class="data-zone"></div>
        </main>
  
        <main id="page-stok-material" class="page">
          <div class="data-zone"></div>
        </main>
  
        <main id="page-tagihan" class="page">
          <div class="data-zone"></div>
        </main>
  
        <main id="page-monitoring" class="page">
          <div class="data-zone"></div>
        </main>
  
        <main id="page-pengaturan" class="page">
          <div class="data-zone"></div>
        </main>
      `;
  
      // export button
      $('#btn-export-dash')?.addEventListener('click', exportDashboardSnapshot);
    }
  
    function showPage(id){
      $$('.page').forEach(p=>p.classList.remove('active'));
      $(`#page-${id}`)?.classList.add('active');
      $$('.nav-item.active').forEach(el=>el.classList.remove('active'));
      $(`.nav-item[data-nav="${id}"]`)?.classList.add('active');
    }
  
    function reflectGuestPlaceholder(id){
      const container = $(`#page-${id}`); if(!container) return;
      let zone = container.querySelector('.data-zone');
      if(!zone){ zone = document.createElement('div'); zone.className = 'data-zone'; container.appendChild(zone); }
      if(!currentUser || userRole==='Pending'){
        zone.innerHTML = `
          <div class="card placeholder-card">
            <div class="placeholder-title">Mode Tamu</div>
            <div class="placeholder-desc">Data tidak ditampilkan. Silakan login untuk melihat data.</div>
            <button class="btn btn-primary" id="placeholder-login">Login</button>
          </div>`;
        $('#placeholder-login')?.addEventListener('click', openLoginModal);
      }else{
        if(zone.classList.contains('placeholder')) { zone.innerHTML=''; zone.classList.remove('placeholder'); }
      }
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
  
    function setNotifDot(n){
      const badge = $('.notification-badge'); if(!badge) return;
      badge.classList.toggle('hidden', !(n>0));
    }
  
// Gunakan bahasa perangkat
auth.useDeviceLanguage?.();

// Deteksi file:// dan beri warning + cegah login macet
(function guardFileProtocol(){
  if (location.protocol === 'file:') {
    // Non-aktifkan tombol login agar tidak memicu error membingungkan
    document.addEventListener('DOMContentLoaded', ()=>{
      const btn = document.getElementById('google-login-btn');
      btn && (btn.disabled = true);
    });
    // Info jelas untuk dev
    console.warn('Firebase Auth tidak mendukung file://. Jalankan via http(s) (localhost/hosting).');
  }
})();

async function signInWithGoogle(){
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    // tutup modal agar tidak tumpang tindih
    document.getElementById('login-modal')?.classList.add('hidden');
    // loading
    typeof toast === 'function' && toast('loading', 'Menyambungkan akun…');

    // mobile/ios → pakai redirect
    const useRedirect = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;

    if (useRedirect) {
      await auth.signInWithRedirect(provider);
      return;
    }

    await auth.signInWithPopup(provider);
    typeof toast === 'function' && toast('success', 'Login berhasil.');
  } catch (err) {
    // Popup diblokir → fallback otomatis redirect
    if (err && (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user')) {
      try {
        await auth.signInWithRedirect(provider);
        return;
      } catch (e2) {
        typeof toast === 'function' && toast('error', mapAuthError(e2));
      }
      return;
    }
    typeof toast === 'function' && toast('error', mapAuthError(err));
    // buka lagi modal untuk user
    document.getElementById('login-modal')?.classList.remove('hidden');
  }
}

// Handle hasil redirect (mobile)
auth.getRedirectResult()
  .then(res => {
    if (res && res.user) {
      typeof toast === 'function' && toast('success', 'Login berhasil.');
      document.getElementById('login-modal')?.classList.add('hidden');
    }
  })
  .catch(e => typeof toast === 'function' && toast('error', mapAuthError(e)));

// Pesan error ramah
function mapAuthError(e){
  const c = e?.code || '';
  if (c.includes('network')) return 'Jaringan bermasalah. Coba lagi.';
  if (c.includes('unauthorized-domain')) return 'Domain belum diizinkan di Firebase Authentication.';
  if (c.includes('operation-not-allowed') || c.includes('provider-disabled')) return 'Sign in Google belum diaktifkan di Firebase.';
  if (c.includes('cancelled')) return 'Login dibatalkan.';
  return e?.message || 'Login gagal.';
}
  
auth.onAuthStateChanged(async (user) => {
    // bersihkan listener lama
    if (roleUnsub) { roleUnsub(); roleUnsub = null; }
  
    if (user) {
      currentUser = user;
  
      // pastikan dokumen member ada & Owner auto-override
      await ensureMemberDoc(user);
  
      // DENGAR perubahan role realtime
      roleUnsub = membersCol.doc(user.uid).onSnapshot(async (snap) => {
        const data = snap.data() || {};
        userRole = data.role || 'Pending';
  
        // kalau email = OWNER_EMAIL tapi role belum 'Owner', paksa jadi Owner
        if ((user.email || '').toLowerCase() === OWNER_EMAIL && userRole !== 'Owner') {
          await membersCol.doc(user.uid).update({
            role: 'Owner',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          userRole = 'Owner';
        }
  
        // Perbarui header + indikator
        updateHeaderForUser(user);
        setConnectionDot(userRole === 'Pending' ? 'yellow' : 'green');
  
        // Terapkan visibilitas sesuai role + hentikan placeholder
        applyRoleVisibility();
  
        // Render hal aktif kalau perlu
        const active = document.querySelector('.page.active')?.id?.replace('page-', '') || 'dashboard';
        renderIfNeeded(active);
  
        // Notif jumlah approval/tagihan (opsional)
        try {
          const projSnap = await projectsCol.limit(1).get();
          if (!projSnap.empty) {
            const pid = projSnap.docs[0].id;
            const sub = await payablesCol.where('projectId','==',pid).where('status','==','submitted').get();
            setNotifDot(sub.size);
          } else setNotifDot(0);
        } catch { setNotifDot(0); }
      }, (err) => {
        console.warn('role listener error:', err);
        setConnectionDot('yellow');
      });
  
    } else {
      // SIGNED OUT
      currentUser = null;
      userRole = 'Guest';
      updateHeaderForUser(null);
      setConnectionDot('red');
      setNotifDot(0);
      applyRoleVisibility();
    }
  });
    
    // ===== Dashboard (ringan) =====
    async function initDashboardLight(){
      const cardZone = $('#envelope-cards'); if(!cardZone) return;
      if(!currentUser || userRole==='Pending'){
        cardZone.innerHTML = `
          <div class="kpi-card skeleton"></div>
          <div class="kpi-card skeleton"></div>
          <div class="kpi-card skeleton"></div>`;
        $('#chip-contract').textContent = 'Kontrak: -';
        $('#chip-progress').textContent = 'Progres: -';
        return;
      }
      const projSnap = await projectsCol.limit(1).get();
      if(projSnap.empty){
        $('#chip-contract').textContent = 'Kontrak: -';
        $('#chip-progress').textContent = 'Progres: -';
        cardZone.innerHTML = `<div class="card card-pad">Belum ada proyek.</div>`;
        return;
      }
      const p = projSnap.docs[0].data(); const pid = projSnap.docs[0].id;
      $('#chip-contract').textContent = `Kontrak: ${fmtIDR(p.contractValue||0)}`;
      $('#chip-progress').textContent = `Progres: ${(p.progressPct??0)}%`;
  
      const envSnap = await envelopesCol.doc(pid).get();
      const e = envSnap.data()||{};
      cardZone.innerHTML = `
        <div class="kpi-card"><h5>Operasional</h5><div class="amt">${fmtIDR(e.operationalBalance||0)}</div></div>
        <div class="kpi-card"><h5>Cadangan</h5><div class="amt">${fmtIDR(e.contingencyBalance||0)}</div></div>
        <div class="kpi-card"><h5>Laba Kunci</h5><div class="amt">${fmtIDR(e.profitLockBalance||0)}</div></div>
        <div class="kpi-card"><h5>Overhead</h5><div class="amt">${fmtIDR(e.overheadPoolBalance||0)}</div></div>
        <div class="kpi-card"><h5>Cicilan</h5><div class="amt">${fmtIDR(e.sinkingFundBalance||0)}</div></div>
      `;
    }
  
    // ===== Payment Hub (Tagihan) =====
    async function renderTagihanTable(){
      const zone = $('#page-tagihan .data-zone'); if(!zone) return;
      if(!currentUser || userRole==='Pending'){ reflectGuestPlaceholder('tagihan'); return; }
  
      zone.innerHTML = `
        <div class="card card-pad">
          <div class="section-head">
            <h4>Tagihan</h4>
            <div class="action-row">
              <button class="btn btn-secondary" id="btn-export-payables">Export CSV (7 hari)</button>
            </div>
          </div>
          <div class="table-container">
            <table class="table" id="tbl-payables">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Jenis</th>
                  <th>Deskripsi</th>
                  <th>Nilai</th>
                  <th>Status</th>
                  <th>Jatuh Tempo</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody><tr><td colspan="7">Memuat…</td></tr></tbody>
            </table>
          </div>
        </div>
      `;
      $('#btn-export-payables')?.addEventListener('click', exportPayablesCSV);
  
      // ambil 7 hari belakang sebagai default
      const since = new Date(); since.setDate(since.getDate() - 7);
      const sinceStr = since.toISOString();
  
      const snap = await payablesCol
        .where('createdAt','>=', new Date(sinceStr))
        .orderBy('createdAt','desc')
        .limit(200)
        .get();
  
      const rows = snap.docs.map(d=>{
        const v = d.data();
        return {
          id:d.id,
          date: (v.date||'').slice(0,10) || '-',
          kind: v.kind || '-', // material | upah | cashloan | operasional | subkon
          desc: v.desc || '-',
          amt: v.amount || 0,
          status: v.status || 'draft',
          due: (v.dueDate||'').slice(0,10) || '-',
          canAmend: ['draft','submitted','approved','overdue'].includes(v.status),
          canPay: (v.status==='approved') || (userRole==='Owner' && v.status!=='paid' && v.status!=='void'),
        };
      });
  
      const tbody = $('#tbl-payables tbody');
      if(!rows.length){ tbody.innerHTML = `<tr><td colspan="7">Tidak ada tagihan 7 hari terakhir.</td></tr>`; return; }
      tbody.innerHTML = rows.map(r=>{
        const actions = (userRole==='Owner'||userRole==='Admin') ? `
          <div class="actions">
            ${r.canPay ? `<button class="btn btn-primary btn-xs" data-act="pay" data-id="${r.id}">Bayar</button>` : ''}
            ${r.canAmend ? `<button class="btn btn-secondary btn-xs" data-act="amend" data-id="${r.id}">Amend</button>` : ''}
            <button class="btn btn-ghost btn-xs" data-act="detail" data-id="${r.id}">Detail</button>
            ${(userRole==='Owner' && r.status!=='paid') ? `<button class="btn btn-danger btn-xs" data-act="void" data-id="${r.id}">Void</button>` : ''}
          </div>` : `<span class="text-muted">—</span>`;
        return `
          <tr>
            <td>${r.date}</td>
            <td>${r.kind}</td>
            <td>${escapeHTML(r.desc)}</td>
            <td>${fmtIDR(r.amt)}</td>
            <td>${badgeStatus(r.status)}</td>
            <td>${r.due}</td>
            <td>${actions}</td>
          </tr>`;
      }).join('');
  
      // actions handler (delegasi)
      tbody.addEventListener('click', async (e)=>{
        const btn = e.target.closest('button[data-act]'); if(!btn) return;
        const act = btn.getAttribute('data-act'); const id = btn.getAttribute('data-id');
        if(act==='pay') openPayModal(id);
        if(act==='amend') openAmendModal(id);
        if(act==='void') voidPayable(id);
        if(act==='detail') showPayableDetail(id);
      });
    }
  
    function badgeStatus(s){
      const map = {
        draft:'badge gray', submitted:'badge blue', approved:'badge green',
        overdue:'badge orange', paid:'badge solid', void:'badge red'
      };
      const cls = map[s] || 'badge gray';
      return `<span class="${cls}">${s}</span>`;
    }
  
    function escapeHTML(str){
      return (str||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
    }
  
    function createModal(html){
      const wrap = document.createElement('div');
      wrap.className = 'modal-bg';
      wrap.innerHTML = `<div class="modal-content">${html}</div>`;
      document.body.appendChild(wrap);
      lockScroll(true);
      return wrap;
    }
  
    async function openPayModal(payableId){
      // get payable
      const doc = await payablesCol.doc(payableId).get();
      if(!doc.exists){ toast('error','Tagihan tidak ditemukan'); return; }
      const v = doc.data();
      if(!(userRole==='Owner' || userRole==='Admin')){ toast('error','Tidak berwenang'); return; }
      if(v.status==='paid'){ toast('error','Sudah dibayar'); return; }
  
      const modal = createModal(`
        <div class="modal-header">
          <h4>Bayar Tagihan</h4>
          <button class="icon-btn" data-close><span class="material-symbols-outlined">close</span></button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="form-group">
              <label>Deskripsi</label>
              <input type="text" value="${escapeHTML(v.desc||'')}" disabled>
            </div>
            <div class="form-group">
              <label>Nilai</label>
              <input type="text" value="${fmtIDR(v.amount||0)}" disabled>
            </div>
            <div class="form-group">
              <label>Sumber Dana</label>
              <select id="pay-source">
                <option value="operational">Operasional</option>
                <option value="overheadPool">Overhead</option>
                <option value="sinkingFund">Sinking (cicilan pinjaman)</option>
              </select>
            </div>
            <div class="form-group">
              <label>Tanggal Bayar</label>
              <input id="pay-date" type="date" value="${todayStr()}">
            </div>
            <div class="form-group full">
              <label>Catatan</label>
              <textarea id="pay-note" rows="3" placeholder="Opsional"></textarea>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-close>Tutup</button>
          <button class="btn btn-primary" id="btn-confirm-pay" data-id="${doc.id}">Konfirmasi Bayar</button>
        </div>
      `);
  
      modal.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>{ modal.remove(); lockScroll(false); }));
      $('#btn-confirm-pay')?.addEventListener('click', async ()=>{
        const source = /** @type {HTMLSelectElement} */(modal.querySelector('#pay-source'))?.value || 'operational';
        const date = /** @type {HTMLInputElement} */(modal.querySelector('#pay-date'))?.value || todayStr();
        const note = /** @type {HTMLTextAreaElement} */(modal.querySelector('#pay-note'))?.value || '';
        modal.remove(); lockScroll(false);
        await confirmPayablePayment(doc.id, source, date, note);
        await renderTagihanTable();
      });
    }
  
    async function confirmPayablePayment(id, sourceKey, paidDate, note){
      toast('loading','Memproses pembayaran...');
      const docRef = payablesCol.doc(id);
      await db.runTransaction(async (tx)=>{
        const pSnap = await tx.get(docRef);
        if(!pSnap.exists) throw new Error('Tagihan hilang');
        const p = pSnap.data();
        if(p.status==='paid') throw new Error('Sudah dibayar');
  
        // Update status
        tx.update(docRef, {
          status: 'paid',
          paidAt: new Date(paidDate),
          paidBy: (currentUser?.email||''),
          paidNote: note || '',
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
  
        // Buat jurnal entri
        const entry = {
          type:'payment',
          payableId: id,
          amount: p.amount||0,
          source: sourceKey,    // operational | overheadPool | sinkingFund
          at: new Date(paidDate),
          by: (currentUser?.email||''),
          note: note||'',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        tx.set(entriesCol.doc(), entry);
  
        // Kurangi saldo envelope terkait
        const projSnap = await projectsCol.limit(1).get();
        if(!projSnap.empty){
          const envRef = envelopesCol.doc(projSnap.docs[0].id);
          const envSnap = await tx.get(envRef);
          const env = envSnap.exists ? envSnap.data() : {};
          const keyMap = { operational:'operationalBalance', overheadPool:'overheadPoolBalance', sinkingFund:'sinkingFundBalance' };
          const balKey = keyMap[sourceKey] || 'operationalBalance';
          const cur = Number(env?.[balKey] || 0);
          const next = Math.max(0, cur - Number(p.amount||0));
          tx.set(envRef, { [balKey]: next, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge:true });
        }
      });
      toast('success','Pembayaran berhasil.');
    }
  
    async function openAmendModal(payableId){
      const doc = await payablesCol.doc(payableId).get();
      if(!doc.exists){ toast('error','Tagihan tidak ditemukan'); return; }
      const v = doc.data();
      if(!(userRole==='Owner' || userRole==='Admin')){ toast('error','Tidak berwenang'); return; }
      if(v.status==='paid'){ toast('error','Tidak dapat amend tagihan yang sudah dibayar'); return; }
  
      const modal = createModal(`
        <div class="modal-header">
          <h4>Amend Tagihan</h4>
          <button class="icon-btn" data-close><span class="material-symbols-outlined">close</span></button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="form-group full">
              <label>Deskripsi</label>
              <input id="am-desc" type="text" value="${escapeHTML(v.desc||'')}" />
            </div>
            <div class="form-group">
              <label>Nilai</label>
              <input id="am-amt" type="number" min="0" value="${Number(v.amount||0)}" />
            </div>
            <div class="form-group">
              <label>Jatuh Tempo</label>
              <input id="am-due" type="date" value="${(v.dueDate||'').slice(0,10)}" />
            </div>
            <div class="form-group full">
              <label>Alasan</label>
              <textarea id="am-reason" rows="3" placeholder="Wajib diisi"></textarea>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-close>Tutup</button>
          <button class="btn btn-primary" id="btn-confirm-amend" data-id="${doc.id}">Simpan Perubahan</button>
        </div>
      `);
      modal.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>{ modal.remove(); lockScroll(false); }));
      $('#btn-confirm-amend')?.addEventListener('click', async ()=>{
        const desc = /** @type {HTMLInputElement} */(modal.querySelector('#am-desc'))?.value || '';
        const amt  = asNum(/** @type {HTMLInputElement} */(modal.querySelector('#am-amt'))?.value);
        const due  = /** @type {HTMLInputElement} */(modal.querySelector('#am-due'))?.value || '';
        const rsn  = /** @type {HTMLTextAreaElement} */(modal.querySelector('#am-reason'))?.value || '';
        if(!rsn.trim()){ toast('error','Alasan wajib diisi'); return; }
        modal.remove(); lockScroll(false);
        await confirmAmendPayable(doc.id, {desc, amount:amt, dueDate:due? new Date(due): null, reason:rsn});
        await renderTagihanTable();
      });
    }
  
    async function confirmAmendPayable(id, payload){
      toast('loading','Menyimpan perubahan…');
      const docRef = payablesCol.doc(id);
      await db.runTransaction(async (tx)=>{
        const snap = await tx.get(docRef);
        if(!snap.exists) throw new Error('Tagihan hilang');
        const before = snap.data();
        if(before.status==='paid') throw new Error('Tidak bisa amend yang sudah dibayar');
  
        // catat amendment
        const amendRef = docRef.collection('amendments').doc();
        tx.set(amendRef, {
          before: { desc:before.desc||'', amount:before.amount||0, dueDate: before.dueDate||null },
          after: { desc: payload.desc, amount: payload.amount, dueDate: payload.dueDate||null },
          reason: payload.reason || '',
          by: (currentUser?.email||''),
          at: firebase.firestore.FieldValue.serverTimestamp()
        });
  
        // update nilai utama
        const up = {
          desc: payload.desc,
          amount: payload.amount,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        if(payload.dueDate) up['dueDate'] = payload.dueDate;
        tx.update(docRef, up);
      });
      toast('success','Perubahan disimpan.');
    }
  
    async function voidPayable(id){
      if(!(userRole==='Owner')){ toast('error','Hanya Owner yang dapat void'); return; }
      if(!confirm('Void tagihan ini?')) return;
      await payablesCol.doc(id).update({ status:'void', updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      toast('success','Tagihan di-void.');
      await renderTagihanTable();
    }
  
    async function showPayableDetail(id){
      const doc = await payablesCol.doc(id).get();
      if(!doc.exists){ toast('error','Tagihan tidak ditemukan'); return; }
      const v = doc.data();
      const modal = createModal(`
        <div class="modal-header">
          <h4>Detail Tagihan</h4>
          <button class="icon-btn" data-close><span class="material-symbols-outlined">close</span></button>
        </div>
        <div class="modal-body">
          <div class="detail-grid">
            <div><strong>Deskripsi</strong><div>${escapeHTML(v.desc||'-')}</div></div>
            <div><strong>Jenis</strong><div>${v.kind||'-'}</div></div>
            <div><strong>Nilai</strong><div>${fmtIDR(v.amount||0)}</div></div>
            <div><strong>Status</strong><div>${v.status||'-'}</div></div>
            <div><strong>Jatuh Tempo</strong><div>${(v.dueDate||'').slice(0,10)||'-'}</div></div>
            <div><strong>Dibuat</strong><div>${(v.createdAt?.toDate?.()||v.createdAt||'').toString().slice(0,24)}</div></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-close>Tutup</button>
        </div>
      `);
      modal.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>{ modal.remove(); lockScroll(false); }));
    }
  
    // ===== Approval Center (Pengaturan) =====
    async function renderApprovalCenter(){
      const zone = $('#page-pengaturan .data-zone'); if(!zone) return;
      if(!currentUser || userRole==='Pending'){ reflectGuestPlaceholder('pengaturan'); return; }
  
      zone.innerHTML = `
        <div class="card card-pad">
          <div class="section-head">
            <h4>Approval Center</h4>
          </div>
          <div class="table-container">
            <table class="table" id="tbl-approvals">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Jenis</th>
                  <th>Target</th>
                  <th>Perubahan</th>
                  <th>Pemohon</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody><tr><td colspan="7">Memuat…</td></tr></tbody>
            </table>
          </div>
        </div>
      `;
  
      const snap = await changeRequestsCol
        .orderBy('createdAt','desc')
        .limit(100)
        .get();
  
      const rows = snap.docs.map(d=>{
        const v = d.data();
        const diff = v.changeType==='worker_rate'
          ? `Rate: ${fmtIDR(v.current||0)} → ${fmtIDR(v.proposed||0)}`
          : (v.summary || '-');
        return {
          id:d.id,
          date: (v.createdAt?.toDate?.()?.toISOString()?.slice(0,10)) || '-',
          type: v.changeType || '-',
          target: v.targetName || v.workerName || v.targetId || '-',
          diff,
          requester: v.requestedBy || '-',
          status: v.status || 'pending'
        };
      });
  
      const tbody = $('#tbl-approvals tbody');
      if(!rows.length){ tbody.innerHTML = `<tr><td colspan="7">Tidak ada permintaan.</td></tr>`; return; }
  
      tbody.innerHTML = rows.map(r=>{
        const actions = (userRole==='Owner'||userRole==='Admin') && r.status==='pending'
          ? `<div class="actions">
              <button class="btn btn-primary btn-xs" data-act="approve" data-id="${r.id}">Approve</button>
              <button class="btn btn-danger btn-xs" data-act="reject" data-id="${r.id}">Reject</button>
             </div>`
          : `<span class="text-muted">—</span>`;
        const badge = r.status==='pending' ? 'badge blue' : r.status==='approved' ? 'badge green' : 'badge red';
        return `
          <tr>
            <td>${r.date}</td>
            <td>${r.type}</td>
            <td>${escapeHTML(r.target)}</td>
            <td>${escapeHTML(r.diff)}</td>
            <td>${escapeHTML(r.requester)}</td>
            <td><span class="${badge}">${r.status}</span></td>
            <td>${actions}</td>
          </tr>`;
      }).join('');
  
      tbody.addEventListener('click', async (e)=>{
        const btn = e.target.closest('button[data-act]'); if(!btn) return;
        const act = btn.getAttribute('data-act'); const id = btn.getAttribute('data-id');
        if(act==='approve') await actOnChangeRequest(id, true);
        if(act==='reject') await actOnChangeRequest(id, false);
        await renderApprovalCenter();
      });
    }
  
    async function actOnChangeRequest(id, approve){
      if(!(userRole==='Owner'||userRole==='Admin')){ toast('error','Tidak berwenang'); return; }
      toast('loading', approve? 'Menyetujui…':'Menolak…');
      await db.runTransaction(async (tx)=>{
        const ref = changeRequestsCol.doc(id);
        const snap = await tx.get(ref);
        if(!snap.exists) throw new Error('Request tidak ditemukan');
        const v = snap.data();
        if(v.status!=='pending') throw new Error('Sudah diproses');
  
        // apply if approve
        if(approve && v.changeType==='worker_rate' && v.workerId){
          const wRef = workersCol.doc(v.workerId);
          tx.update(wRef, { rate: Number(v.proposed||0), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        }
  
        tx.update(ref, {
          status: approve? 'approved':'rejected',
          decidedBy: (currentUser?.email||''),
          decidedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });
      toast('success', approve? 'Disetujui.':'Ditolak.');
    }
  
    // ===== Export CSV =====
    async function exportPayablesCSV(){
      if(!currentUser || userRole==='Pending'){ toast('error','Login dulu'); return; }
      const since = new Date(); since.setDate(since.getDate() - 7);
      const snap = await payablesCol.where('createdAt','>=', since).orderBy('createdAt','desc').get();
      const header = ['id','date','kind','desc','amount','status','dueDate'];
      const rows = snap.docs.map(d=>{
        const v = d.data();
        return [
          d.id,
          (v.date||'').slice(0,10),
          v.kind||'',
          (v.desc||'').replace(/\n/g,' '),
          Number(v.amount||0),
          v.status||'',
          (v.dueDate||'').slice ? (v.dueDate||'').slice(0,10) : (v.dueDate?.toDate?.()?.toISOString()?.slice(0,10) || '')
        ];
      });
      downloadCSV('payables_7d.csv', [header, ...rows]);
    }
  
    async function exportDashboardSnapshot(){
      if(!currentUser || userRole==='Pending'){ toast('error','Login dulu'); return; }
      const projSnap = await projectsCol.limit(1).get();
      if(projSnap.empty){ toast('error','Belum ada proyek'); return; }
      const p = projSnap.docs[0].data(); const pid = projSnap.docs[0].id;
      const envSnap = await envelopesCol.doc(pid).get(); const e = envSnap.data()||{};
      const header = ['contractValue','progressPct','operational','contingency','profitLock','overheadPool','sinkingFund'];
      const row = [
        Number(p.contractValue||0),
        Number(p.progressPct||0),
        Number(e.operationalBalance||0),
        Number(e.contingencyBalance||0),
        Number(e.profitLockBalance||0),
        Number(e.overheadPoolBalance||0),
        Number(e.sinkingFundBalance||0),
      ];
      downloadCSV('dashboard_snapshot.csv', [header, row]);
    }
  
    function downloadCSV(filename, rows){
      const csv = rows.map(r=>r.map(cell=>{
        const s = (cell===null||cell===undefined) ? '' : String(cell);
        if(/[",\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
        return s;
      }).join(',')).join('\n');
      const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  
  });
  
  let roleUnsub = null; // listener Firestore untuk role
