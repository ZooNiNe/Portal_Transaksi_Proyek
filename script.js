/* =====================================================================
 * PORTAL TRANSAKSI PROYEK — FRONTEND (script.js)
 * Versi: 2025-09-10 (mobile-first, RBAC, offline queue, compressor)
 * ===================================================================== */

/* ========= KONFIG ========= */
const scriptURL = 'https://script.google.com/macros/s/AKfycbxWzUyMEIW7bZbjcy73QLI0aSJvwPa0SEIXIE5x0Vkks_JktmZD52OSvgsHgBq-vr66Kw/exec';
const EXIT_FALLBACK_URL = 'about:blank';
const ONE_MB = 1024 * 1024;
const MAX_INLINE_BYTES = ONE_MB;        // >1 MB → defer queue
const IMG_MAX_W = 1920;                 // batas kompres gambar (lebar maks)
const IMG_MAX_H = 1920;                 // batas kompres gambar (tinggi maks)
const IMG_QUALITY = 0.7;                // kualitas JPEG default
const RETRY_SEC = 15;                   // jeda retry queue (detik)

/* ========= HELPER DOM ========= */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const byId = (id) => document.getElementById(id);
function safeOn(el, ev, fn, opts) { if (el) el.addEventListener(ev, fn, opts||false); }

/* ========= SECTION/VIEW REFS (harus match index.html) ========= */
const view = {
  dash: byId('view-dashboard'),
  step1: byId('step1'),
  step2: byId('step2'),
  step3: byId('step3'),
  rekap: byId('view-rekap'),
  absensi: byId('view-absensi'),
  akun: byId('view-akun'),
  previewModal: byId('previewModal'),
  loadingPop: byId('loadingPop'),
  resultPop: byId('resultPop'),
  pickerPop: byId('pickerPop'),
};

const nav = {
  dash: byId('nav-dash'),
  input: byId('nav-input'),
  absensi: byId('nav-absen'),
  rekap: byId('nav-rekap'),
  akun: byId('nav-akun'),
};

const kpi = {
  hariProyek: byId('kpiHariProyek'),
  totalOut: byId('kpiTotalOut'),
  utangNow: byId('kpiUtang'),
  cashLoan: byId('kpiCashLoan'),
  tagihanNow: byId('kpiTagihan'),
  saldoToday: byId('kpiSaldoToday'),
  pengeluaranToday: byId('kpiOutToday'),
  tagihanToday: byId('kpiTagihanToday'),
};

/* ========= FORM STEP 1 / 2 / 3 ========= */
const step = {
  penginput: byId('penginput'),
  jenis: byId('jenis'),
  kategoriAwal: byId('kategoriAwal'),
  tanggal: byId('tanggal'),
  proyek: byId('proyek'),
  uraianWrap: byId('wrapUraian'),
  uraian: byId('uraian'),
  nominal: byId('nominal'),
  kreditor: byId('kreditor'),
  kreditorLain: byId('kreditorLain'),
  status: byId('status'),
  // material fields
  materialBlock: byId('materialBlock'),
  noFaktur: byId('noFaktur'),
  namaBarang: byId('namaBarang'),
  hargaSatuan: byId('hargaSatuan'),
  qty: byId('qty'),
  totalHarga: byId('totalHarga'),
  // upload wrap
  wrapBon: byId('wrapBon'),
  wrapSJ: byId('wrapSJ'),
  wrapUmum: byId('wrapBuktiUmum'),
  fileBon: byId('buktiBon'),
  fileSJ: byId('buktiSJ'),
  fileUmum: byId('buktiUmum'),
};

const btn = {
  toStep2: byId('toStep2'),
  backTo1: byId('backTo1'),
  toStep3: byId('toStep3'),
  backTo2: byId('backTo2'),
  openPreview: byId('openPreview'),
  cancelPreview: byId('cancel-btn'),
  confirmSend: byId('confirm-btn'),
  // result pop
  btnKeluar: byId('btnKeluar'),
  btnInputKembali: byId('btnInputKembali'),
  resultClose: byId('resultClose'),
  // picker
  pickerCancel: byId('pickerCancel'),
  // dashboard
  refreshDash: byId('btnRefresh'),
  gotoInput: byId('gotoInput'),
};

/* ========= PREVIEW ELEMS ========= */
const pv = {
  step1: byId('pvStep1'),
  step2: byId('pvStep2'),
  tab1: byId('pvTab1'),
  tab2: byId('pvTab2'),
  back: byId('pvBack'),
  next: byId('pvNext'),

  penginput: byId('pv-penginput'),
  jenis: byId('pv-jenis'),
  kategori: byId('pv-kategori'),
  tanggal: byId('pv-tanggal'),
  proyek: byId('pv-proyek'),
  uraian: byId('pv-uraian'),
  nominal: byId('pv-nominal'),
  kreditor: byId('pv-kreditor'),
  status: byId('pv-status'),

  matLabel: byId('pv-mat-label'),
  matValue: byId('pv-mat-value'),
  thumbsWrap: byId('pv-thumbs'),
  buktiKosong: byId('pv-bukti-kosong'),
};

/* ========= PICKER ========= */
const picker = {
  pop: view.pickerPop,
  title: byId('pickerTitle'),
  list: byId('pickerList'),
};

/* ========= STATE ========= */
const STATE = {
  config: null,      // hasil GET getConfig
  role: 'GUEST',
  email: '',
  currentView: 'dash',   // dash|input_step1|input_step2|input_step3|rekap|absensi|akun
  form: {
    penginput: '', jenis: 'Pengeluaran', kategori: 'Operasional',
    tanggal: '', proyek: '', uraian: '', nominal: '',
    kreditor: '', status: 'Sudah Dibayar',
    material: {
      noFaktur: '', namaBarang: '', hargaSatuan: '', qty: '', total: ''
    }
  },
  uploads: {
    invoice: [], suratJalan: [], umum: [] // FileList snapshot
  },
  queue: [],         // antrean offline (localStorage)
  chart: null,       // Chart.js instance
};

/* ========= UTIL ========= */
function toIDR(v){ return (v||'').toString().replace(/[^\d]/g,'').replace(/\B(?=(\d{3})+(?!\d))/g,'.'); }
function nowISO(){ const d = new Date(); const t = new Date(d.getTime()-d.getTimezoneOffset()*60000); return t.toISOString().slice(0,10); }
function show(el){ if(el) el.classList.remove('hidden'); }
function hide(el){ if(el) el.classList.add('hidden'); }
function setText(el, val){ if(el) el.textContent = val ?? '-'; }
function scrollTop(){ window.scrollTo({top:0, behavior:'smooth'}); }

/* ========= LOADING & RESULT ========= */
function showLoading(on=true){ if(view.loadingPop) view.loadingPop.classList.toggle('show', on); }
function exitApp(){
  window.open('', '_self'); window.close();
  setTimeout(()=>{ if (document.visibilityState !== 'hidden'){ location.replace(EXIT_FALLBACK_URL); } }, 100);
}
function setResultActions(type){
  const actions = byId('resultActions');
  if(!actions) return;
  if(type==='success'){
    actions.style.display='';
    if(btn.btnKeluar) btn.btnKeluar.onclick = exitApp;
    if(btn.btnInputKembali) btn.btnInputKembali.onclick = ()=> {
      if(view.resultPop) view.resultPop.classList.remove('show');
      resetForm();
      go('input_step1');
    };
    if(btn.resultClose) btn.resultClose.classList.add('hidden');
  } else {
    actions.style.display='none';
    if(btn.resultClose){
      btn.resultClose.classList.remove('hidden');
      btn.resultClose.onclick = ()=> view.resultPop.classList.remove('show');
    }
  }
}
function showResult(type='success', title='Selesai', message='Data anda telah terinput.'){
  const iconWrap = byId('resultIcon');
  const ttl = byId('resultTitle');
  const msg = byId('resultMsg');
  if(iconWrap){
    iconWrap.innerHTML = (type==='success')
      ? `<div class="icon-wrap success" aria-hidden="true">
           <svg viewBox="0 0 52 52"><path class="stroke" d="M14 27 l8 8 l16 -18"/></svg>
         </div>`
      : `<div class="icon-wrap error" aria-hidden="true">
           <svg viewBox="0 0 52 52"><path class="stroke" d="M16 16 L36 36"/><path class="stroke" d="M36 16 L16 36"/></svg>
         </div>`;
  }
  if(ttl) ttl.textContent = title || (type==='success'?'Selesai':'Terjadi Kesalahan');
  if(msg) msg.textContent = message || (type==='success'?'Data anda telah terinput.':'Periksa kembali input anda.');
  setResultActions(type);
  if(view.resultPop) view.resultPop.classList.add('show');
}
function quickPop(message){ showResult('error','Terjadi Kesalahan', message || 'Periksa kembali input anda.'); return false; }

/* ========= PICKER (Dropdown modal) ========= */
function openPicker(selectEl, triggerBtn){
  if(!selectEl || !triggerBtn || !picker.pop) return;
  picker.title.textContent = triggerBtn.parentElement.querySelector('label')?.textContent || 'Pilih Opsi';
  picker.list.innerHTML = '';
  [...selectEl.options].forEach((opt, idx)=>{
    const div = document.createElement('div');
    div.className = 'picker-option' + (opt.selected?' selected':'') + (opt.disabled?' disabled':'');
    div.textContent = opt.text;
    if (!opt.disabled){
      div.addEventListener('click', ()=>{
        selectEl.selectedIndex = idx;
        triggerBtn.textContent = opt.text;
        selectEl.dispatchEvent(new Event('change',{bubbles:true}));
        picker.pop.classList.remove('show');
      }, {passive:true});
    }
    picker.list.appendChild(div);
  });
  picker.pop.classList.add('show');
}
safeOn(btn.pickerCancel,'click',()=> picker.pop.classList.remove('show'));

/* ========= ENHANCE <select> MENJADI PICKER ========= */
function enhanceSelects(){
  $$('select[data-nice]').forEach((sel)=>{
    if(sel.dataset.enhanced) return;
    sel.dataset.enhanced='1';
    sel.classList.add('native-hidden');
    const wrap = document.createElement('div'); wrap.className='nice-wrap';
    sel.parentNode.insertBefore(wrap, sel); wrap.appendChild(sel);
    const btn = document.createElement('button'); btn.type='button'; btn.className='nice-select';
    btn.setAttribute('aria-haspopup','dialog');
    btn.textContent = sel.options[sel.selectedIndex]?.text || '';
    wrap.appendChild(btn);
    const open = (e)=>{ e.preventDefault(); openPicker(sel, btn); };
    btn.addEventListener('click', open);
    btn.addEventListener('touchstart', open, {passive:false});
  });
}

/* ========= NAV / ROUTER ========= */
function showView(key){
  STATE.currentView = key;
  // hide all
  Object.values(view).forEach(v => v && v.classList && v.classList.add('hidden'));
  // map key
  const map = {
    'dash': view.dash,
    'input_step1': view.step1,
    'input_step2': view.step2,
    'input_step3': view.step3,
    'rekap': view.rekap,
    'absensi': view.absensi,
    'akun': view.akun
  };
  const el = map[key];
  if(el){ el.classList.remove('hidden'); scrollTop(); }
  // switch tab active
  $$('.bottom-tab').forEach(b=>b && b.classList.remove('active'));
  const activeBtn = ({
    'dash':'nav-dash','input_step1':'nav-input','input_step2':'nav-input','input_step3':'nav-input',
    'rekap':'nav-rekap','absensi':'nav-absen','akun':'nav-akun'
  })[key];
  const btnEl = byId(activeBtn);
  if(btnEl) btnEl.classList.add('active');
}

safeOn(nav.dash,'click',()=> showView('dash'));
safeOn(nav.input,'click',()=> showView('input_step1'));
safeOn(nav.absensi,'click',()=> showView('absensi'));
safeOn(nav.rekap,'click',()=> showView('rekap'));
safeOn(nav.akun,'click',()=> showView('akun'));

/* ========= CONFIG & RBAC ========= */
async function loadConfig(){
  const url = `${scriptURL}?action=getconfig`;
  const r = await fetch(url, {method:'GET'});
  const cfg = await r.json();
  STATE.config = cfg;
  STATE.role = cfg.role || 'GUEST';
  STATE.email = cfg.email || '';

  // isi dropdown proyek, kreditor, jenis, kategori, penginput
  fillSelect(step.proyek, (cfg.projects||[]).map(p=>({value:p.id, text:p.name})));
  // kreditor: list vendor aktif + opsi lainnya
  const kreds = (cfg.kreditor||[]).map(x=>({value:x, text:x}));
  kreds.push({value:'__OTHER__', text:'Lainnya… (ketik sendiri)'});
  fillSelect(step.kreditor, kreds);

  // jenis & kategori (hardcode sesuai backend)
  fillSelect(step.jenis, (cfg.jenis||[]).map(x=>({value:x, text:x})));
  fillSelect(step.kategoriAwal, (cfg.kategori||[]).map(x=>({value:x, text:x})));

  // penginput: tetap Oji/Bemo/Opi (sesuai permintaan), bisa dikunci via RBAC jika perlu
  enhanceSelects();
  enforceRBAC();
}

function enforceRBAC(){
  // Admin full, OPS_MATERIAL/OPS_OPERASIONAL terbatas, AUDITOR read-only
  const role = STATE.role;
  const forInput = byId('gate-input');   // container tombol/input di view input
  const forAbsensi = byId('gate-absen'); // container input absensi
  const forRekapDownload = byId('gate-rekap-dl'); // tombol unduh

  const canInput = (role==='ADMIN' || role==='OPS_MATERIAL' || role==='OPS_OPERASIONAL');
  const canAbsensi = (role==='ADMIN' || role==='OPS_OPERASIONAL');
  const canDownload = (role!=='GUEST'); // auditor boleh unduh

  if(forInput) forInput.classList.toggle('disabled-area', !canInput);
  if(forAbsensi) forAbsensi.classList.toggle('disabled-area', !canAbsensi);
  if(forRekapDownload) forRekapDownload.classList.toggle('disabled-area', !canDownload);

  // Dashboard: sembunyikan tombol input untuk auditor/guest
  const dashQuick = byId('dash-quick-input');
  if(dashQuick) dashQuick.style.display = canInput ? '' : 'none';
}

/* ========= FILL SELECT ========= */
function fillSelect(sel, options){
  if(!sel) return;
  sel.innerHTML = '';
  options.forEach(op=>{
    const o = document.createElement('option');
    o.value = op.value;
    o.textContent = op.text;
    sel.appendChild(o);
  });
}

/* ========= DASHBOARD ========= */
async function loadDashboard(){
  try{
    const r = await fetch(`${scriptURL}?action=dashboard`, {method:'GET'});
    const d = await r.json();
    // KPI atas (nilai bisa null → fallback '-')
    if(kpi.totalOut) setText(kpi.totalOut, d.totalMaterial && d.totalGaji && d.totalOperasional
      ? `Rp ${(toNumber(d.totalMaterial)+toNumber(d.totalGaji)+toNumber(d.totalOperasional)).toLocaleString('id-ID')}`
      : '-');

    setText(kpi.hariProyek, d.hariProyek || '-');
    setText(kpi.utangNow, d.utang || '-');
    setText(kpi.cashLoan, d.cashloan || '-');
    setText(kpi.tagihanNow, d.tagihan || '-');
    setText(kpi.saldoToday, d.kas || '-');
    setText(kpi.pengeluaranToday, d.outToday || '-');
    setText(kpi.tagihanToday, d.tagihanToday || '-');

    // Chart pengeluaran 7 hari
    const ctx = byId('chartPengeluaran');
    if(ctx && window.Chart){
      if(STATE.chart) STATE.chart.destroy();
      STATE.chart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: d.chart?.labels || [],
          datasets: [{label:'Pengeluaran', data: d.chart?.values || []}]
        },
        options: { responsive:true, maintainAspectRatio:false }
      });
    }
  }catch(e){
    console.error(e);
  }
}
function toNumber(idrLike){
  // 'Rp 1.234' → 1234
  return Number(String(idrLike||'').replace(/[^0-9]/g,'')||0);
}

/* ========= STEP LOGIC ========= */
function resetForm(){
  // step1
  if(step.penginput) step.penginput.selectedIndex = 0;
  if(step.jenis) step.jenis.value = 'Pengeluaran';
  if(step.kategoriAwal) step.kategoriAwal.value = 'Operasional';
  // step2
  if(step.tanggal) step.tanggal.value = nowISO();
  if(step.proyek) step.proyek.selectedIndex = 0;
  if(step.uraian) step.uraian.value = '';
  if(step.nominal) step.nominal.value = '';
  if(step.kreditor){ step.kreditor.value = 'CV Alam Berkah Abadi'; }
  if(step.kreditorLain){ step.kreditorLain.value=''; step.kreditorLain.classList.add('hidden'); }
  if(step.status) step.status.value = 'Sudah Dibayar';
  // material
  ['noFaktur','namaBarang','hargaSatuan','qty','totalHarga'].forEach(k=>{
    if(step[k]) step[k].value = '';
  });
  // files
  ['fileBon','fileSJ','fileUmum'].forEach(id=>{
    const el = step[id]; if(el) el.value='';
  });
  // wrap
  toggleMaterialBlock();
  prepareUploadSection();
}

function go(viewKey){
  showView(viewKey);
}

function toggleMaterialBlock(){
  const show = (step.kategoriAwal?.value==='Material' && step.jenis?.value==='Pengeluaran');
  if(step.materialBlock) step.materialBlock.classList.toggle('hidden', !show);
  if(step.uraianWrap) step.uraianWrap.classList.toggle('hidden', show);
  if(show && !step.noFaktur?.value){
    // ambil nomor faktur global dari backend
    fetch(`${scriptURL}?action=nextfaktur`).then(r=>r.json()).then(d=>{
      if(step.noFaktur && d?.faktur) step.noFaktur.value = d.faktur;
    }).catch(()=>{});
  }
}

function prepareUploadSection(){
  const isMaterialPengeluaran = (step.kategoriAwal?.value==='Material' && step.jenis?.value==='Pengeluaran');
  if(step.wrapBon) step.wrapBon.classList.toggle('hidden', !isMaterialPengeluaran);
  if(step.wrapSJ) step.wrapSJ.classList.toggle('hidden', !isMaterialPengeluaran);
  if(step.wrapUmum) step.wrapUmum.classList.toggle('hidden', isMaterialPengeluaran);
}

function calcTotalMaterial(){
  const hs = parseInt(String(step.hargaSatuan?.value||'').replace(/\./g,''))||0;
  const q  = parseInt(step.qty?.value||0);
  const t  = hs*q;
  if(step.totalHarga) step.totalHarga.value = t ? toIDR(String(t)) : '';
  // sinkron nominal (kolom Nominal dibuang pada UI material — tapi kita pakai totalHarga untuk preview & submit)
}

/* ========= VALIDASI FILE ========= */
const ALLOWED = ['image/','application/pdf'];
function validateFileList(fileList, label){
  const files = [...(fileList||[])];
  for(const f of files){
    const okType = ALLOWED.some(p => (f.type||'').startsWith(p));
    if(!okType) return quickPop(`${label}: ${f.name} bertipe tidak didukung.`);
  }
  return true;
}

/* ========= KOMPRESI GAMBAR (seperti WA: downscale + JPEG) ========= */
async function readAsDataURL(file){
  return new Promise(res=>{
    const fr = new FileReader();
    fr.onload = ()=> res(fr.result);
    fr.readAsDataURL(file);
  });
}
function imgFromDataURL(url){
  return new Promise((res, rej)=>{
    const img = new Image();
    img.onload = ()=> res(img);
    img.onerror = rej;
    img.src = url;
  });
}
async function compressIfNeeded(file){
  // PDF/tipe lain: langsung base64
  if(!file.type.startsWith('image/')){
    const dataURL = await readAsDataURL(file);
    const base64 = (dataURL.split(',')[1]||'');
    return {name:file.name, type:file.type, base64, size:file.size, deferred: (base64.length*0.75) > MAX_INLINE_BYTES};
  }
  // Image → canvas compress
  const dataURL = await readAsDataURL(file);
  const img = await imgFromDataURL(dataURL);
  // scale
  let {width, height} = img;
  const ratio = Math.min(IMG_MAX_W/width, IMG_MAX_H/height, 1);
  const w = Math.round(width * ratio);
  const h = Math.round(height * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const out = canvas.toDataURL('image/jpeg', IMG_QUALITY);
  const base64 = (out.split(',')[1]||'');
  const deferred = (base64.length*0.75) > MAX_INLINE_BYTES;
  return {name: file.name.replace(/\.(png|jpeg|jpg|webp)$/i,'.jpg'), type:'image/jpeg', base64, size: Math.round(base64.length*0.75), deferred};
}

/* ========= PREVIEW ========= */
function pvShow(n){
  const isOne = (n===1);
  if(pv.step1) pv.step1.classList.toggle('active', isOne);
  if(pv.step2) pv.step2.classList.toggle('active', !isOne);
  if(pv.tab1) pv.tab1.classList.toggle('active', isOne);
  if(pv.tab2) pv.tab2.classList.toggle('active', !isOne);
  if(pv.back) pv.back.classList.toggle('hidden', isOne);
  if(pv.next) pv.next.classList.toggle('hidden', !isOne);
}
function filesForPreview(){
  const isMat = (step.kategoriAwal?.value==='Material' && step.jenis?.value==='Pengeluaran');
  if(isMat){
    return [...(step.fileBon?.files||[]), ...(step.fileSJ?.files||[])];
  } else {
    return [...(step.fileUmum?.files||[])];
  }
}
function openPreview(){
  const kreditorFinal = (step.kreditor?.value==='__OTHER__') ? (step.kreditorLain?.value||'').trim() : step.kreditor?.value;
  if(step.kreditor?.value==='__OTHER__' && !kreditorFinal){ return quickPop('Isi Kreditor/Supplier.'); }

  // Validasi minimal
  if(!step.tanggal?.value) return quickPop('Isi Tanggal.');
  if(!step.proyek?.value)  return quickPop('Pilih Proyek.');
  const isMat = (step.kategoriAwal?.value==='Material' && step.jenis?.value==='Pengeluaran');
  if(isMat){
    if(!step.noFaktur?.value) return quickPop('Isi No Faktur.');
    if(!step.namaBarang?.value) return quickPop('Isi Nama Barang.');
    if(!step.hargaSatuan?.value || !step.qty?.value) return quickPop('Harga/Qty belum lengkap.');
    // totalHarga menjadi “nominal” untuk preview (kolom nominal UI kita hilangkan)
  }else{
    if(!step.uraian?.value) return quickPop('Isi Uraian.');
    if(!step.nominal?.value) return quickPop('Isi Nominal.');
  }
  if(!step.status?.value) return quickPop('Pilih Status.');

  // Isi ringkasan
  setText(pv.penginput, step.penginput?.value);
  setText(pv.jenis, step.jenis?.value);
  setText(pv.kategori, step.kategoriAwal?.value);
  setText(pv.tanggal, step.tanggal?.value);
  setText(pv.proyek, step.proyek?.value);

  const showMat = isMat;
  if(pv.matLabel) pv.matLabel.style.display = showMat ? '' : 'none';
  if(pv.matValue) pv.matValue.style.display = showMat ? '' : 'none';
  if(showMat && pv.matValue){
    const hs = step.hargaSatuan?.value||'0';
    const qty = step.qty?.value||'0';
    pv.matValue.textContent = `${step.noFaktur?.value || '-'} • ${step.namaBarang?.value || '-'} • Qty ${qty} @Rp${hs}`;
  }
  setText(pv.uraian, showMat ? '-' : (step.uraian?.value||'-'));

  const nominalText = showMat
    ? (step.totalHarga?.value ? `Rp ${step.totalHarga.value}` : '-')
    : (step.nominal?.value ? `Rp ${step.nominal.value}` : '-');
  setText(pv.nominal, nominalText);

  setText(pv.kreditor, kreditorFinal || '-');
  setText(pv.status, step.status?.value);

  // thumbs
  if(pv.thumbsWrap) pv.thumbsWrap.innerHTML = '';
  const files = filesForPreview().slice(0,8);
  if(!files.length){
    if(pv.buktiKosong) pv.buktiKosong.style.display = 'block';
  }else{
    if(pv.buktiKosong) pv.buktiKosong.style.display = 'none';
    files.forEach(f=>{
      const box = document.createElement('div'); box.className='thumb';
      if((f.type||'').startsWith('image/')){
        const img = document.createElement('img');
        const url = URL.createObjectURL(f);
        img.onload = ()=> URL.revokeObjectURL(url);
        img.src = url;
        box.appendChild(img);
      } else if(f.type==='application/pdf'){ box.classList.add('pdf'); }
      else { box.textContent = f.name; }
      pv.thumbsWrap.appendChild(box);
    });
  }

  pvShow(1);
  if(view.previewModal) view.previewModal.classList.add('active');
}

/* ========= KIRIM (Sheet-first + defer upload >1MB) ========= */
async function sendData(){
  if(view.previewModal) view.previewModal.classList.remove('active');
  showLoading(true);

  try{
    // rakit payload
    const isMat = (step.kategoriAwal?.value==='Material' && step.jenis?.value==='Pengeluaran');
    const kreditorFinal = (step.kreditor?.value==='__OTHER__') ? (step.kreditorLain?.value||'').trim() : step.kreditor?.value;
    const payload = {
      action: 'submit',
      penginput: step.penginput?.value,
      jenis: step.jenis?.value,
      kategori: step.kategoriAwal?.value,
      tanggal: step.tanggal?.value,
      proyek: step.proyek?.value,
      uraian: isMat ? '' : (step.uraian?.value||''),
      nominal: isMat ? String((step.totalHarga?.value||'').replace(/[^\d]/g,'')) : String((step.nominal?.value||'').replace(/[^\d]/g,'')),
      kreditor: kreditorFinal,
      status: step.status?.value,
      material: isMat ? {
        noFaktur: step.noFaktur?.value||'',
        namaBarang: step.namaBarang?.value||'',
        hargaSatuan: String((step.hargaSatuan?.value||'').replace(/[^\d]/g,'')),
        qty: parseInt(step.qty?.value||0,10),
        total: String((step.totalHarga?.value||'').replace(/[^\d]/g,''))
      } : null,
      buktiInvoice: [], buktiSuratJalan: [], buktiLain: [],
      deferredFiles: [] // meta file >1MB
    };

    // kumpulkan & kompres file
    const pushGroup = async (fileList, target, bucket)=>{
      for(const f of [...(fileList||[])]){
        const info = await compressIfNeeded(f);
        if(info.deferred){
          payload.deferredFiles.push({ name: info.name, type: info.type, size: info.size, bucket });
        }else{
          target.push({ name: info.name, type: info.type, base64: info.base64 });
        }
      }
    };

    if(isMat){
      await pushGroup(step.fileBon?.files, payload.buktiInvoice, 'invoice');
      await pushGroup(step.fileSJ?.files,  payload.buktiSuratJalan, 'surat_jalan');
    }else{
      await pushGroup(step.fileUmum?.files, payload.buktiLain, 'lain');
    }

    // kirim ke GAS (masukkan ke sheet dulu)
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(), 25000);
    const r = await fetch(scriptURL, {
      method:'POST',
      headers:{ 'Content-Type':'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload),
      signal: controller.signal
    }).finally(()=>clearTimeout(timer));

    if(!r.ok) throw new Error('HTTP '+r.status);
    const data = await r.json();

    showLoading(false);
    if(data.status==='ok'){
      // simpan job deferred ke queue lokal (untuk upload background via /uploadDeferred bila perlu)
      enqueueLocalDeferredJobs(data.txId, payload.deferredFiles);
      triggerQueueWorker(); // coba langsung jalan
      showResult('success','Selesai','Data anda telah terinput.');
    }else{
      showResult('error','Terjadi Kesalahan', data.error||'Gagal menyimpan.');
    }
  }catch(err){
    showLoading(false);
    const msg = (err.name==='AbortError') ? 'Koneksi lambat. Coba lagi (maks 25 dtk).'
              : (String(err).includes('Failed to fetch') ? 'Gagal terhubung ke server.' : err.message);
    showResult('error','Terjadi Kesalahan', msg);
    console.error(err);
  }
}

/* ========= OFFLINE QUEUE (localStorage) ========= */
function loadQueue(){
  try{
    STATE.queue = JSON.parse(localStorage.getItem('uploadQueue')||'[]');
  }catch(_){ STATE.queue = []; }
}
function saveQueue(){
  localStorage.setItem('uploadQueue', JSON.stringify(STATE.queue||[]));
}
function enqueueLocalDeferredJobs(txId, filesMeta){
  loadQueue();
  (filesMeta||[]).forEach(m=>{
    STATE.queue.push({ txId, ...m, base64:'' }); // base64 kosong: kita akan isi saat retry (baca ulang file? → tidak bisa; maka andalkan Apps Script worker PENDING → saat ini kita biarkan kosong, backend akan tunggu payload klien via /uploadDeferred opsional)
  });
  saveQueue();
}
let queueTimer = null;
function triggerQueueWorker(){
  if(queueTimer) return;
  queueTimer = setInterval(processQueueOnce, RETRY_SEC*1000);
  processQueueOnce();
}
async function processQueueOnce(){
  loadQueue();
  if(!STATE.queue.length){ clearInterval(queueTimer); queueTimer=null; return; }
  // strategi ringan: kirim ping untuk memastikan server hidup; di desain ini, kita biarkan Apps Script worker memproses jika base64 sudah ada.
  // Jika Anda ingin klien juga menyuplai base64 saat offline selesai → perlu menyimpan salinan blob (tidak praktis di localStorage).
  // Jadi skema kita: file >1MB tidak dikirim dari klien; worker server akan menunggu /uploadDeferred jika nanti Anda ingin menambahkannya.
  // Di proyek ini, kita fokus Sheet-first; antrian besar ditangani worker server atau manual reupload.
  // Agar ada progres info: tampilkan badge kecil (opsional).
}

/* ========= EVENT WIRING ========= */
// Dashboard
safeOn(btn.refreshDash, 'click', loadDashboard);
safeOn(btn.gotoInput, 'click', ()=> showView('input_step1'));

// Step1
safeOn(btn.toStep2, 'click', (e)=>{ e.preventDefault(); showView('input_step2'); });

// Step2
safeOn(btn.backTo1, 'click', (e)=>{ e.preventDefault(); showView('input_step1'); });
safeOn(btn.toStep3, 'click', (e)=>{
  e.preventDefault();
  // validasi minimal di step2 → sebagian juga dicek saat preview
  if(!step.tanggal?.value) return quickPop('Isi Tanggal.');
  if(!step.proyek?.value)  return quickPop('Pilih Proyek.');
  const isMat = (step.kategoriAwal?.value==='Material' && step.jenis?.value==='Pengeluaran');
  if(isMat){
    if(!step.noFaktur?.value) return quickPop('Isi No Faktur.');
    if(!step.namaBarang?.value) return quickPop('Isi Nama Barang.');
    if(!step.hargaSatuan?.value || !step.qty?.value) return quickPop('Harga/Qty belum lengkap.');
    calcTotalMaterial();
  }else{
    if(!step.uraian?.value) return quickPop('Isi Uraian.');
    if(!step.nominal?.value) return quickPop('Isi Nominal.');
  }
  if(!step.status?.value) return quickPop('Pilih Status.');
  prepareUploadSection();
  showView('input_step3');
});

// Step3
safeOn(btn.backTo2, 'click', (e)=>{ e.preventDefault(); showView('input_step2'); });
safeOn(btn.openPreview, 'click', (e)=>{ e.preventDefault(); openPreview(); });

// Preview
safeOn(pv.tab1, 'click', ()=> pvShow(1));
safeOn(pv.tab2, 'click', ()=> pvShow(2));
safeOn(pv.back, 'click', ()=> pvShow(1));
safeOn(pv.next, 'click', ()=> pvShow(2));
safeOn(btn.cancelPreview, 'click', ()=> view.previewModal && view.previewModal.classList.remove('active'));
safeOn(btn.confirmSend, 'click', sendData);

// Kreditor “Lainnya”
safeOn(step.kreditor,'change', ()=>{
  if(step.kreditor.value==='__OTHER__'){ step.kreditorLain.classList.remove('hidden'); step.kreditorLain.focus(); }
  else { step.kreditorLain.classList.add('hidden'); step.kreditorLain.value=''; }
});

// Format rupiah input
safeOn(step.nominal,'input', ()=> step.nominal.value = toIDR(step.nominal.value));
safeOn(step.hargaSatuan,'input', ()=> { step.hargaSatuan.value = toIDR(step.hargaSatuan.value); calcTotalMaterial(); });
safeOn(step.qty,'input', calcTotalMaterial);

// Toggle Material Block
safeOn(step.jenis,'change', toggleMaterialBlock);
safeOn(step.kategoriAwal,'change', toggleMaterialBlock);

/* ========= INIT ========= */
document.addEventListener('DOMContentLoaded', async ()=>{
  // default tanggal hari ini
  if(step.tanggal) step.tanggal.value = nowISO();
  await loadConfig();
  enhanceSelects();
  toggleMaterialBlock();
  prepareUploadSection();
  showView('dash');
  loadDashboard();
  triggerQueueWorker();
});

