/* ============================================================
   PORTAL TRANSAKSI PROYEK – Frontend Mobile (script.js)
   - RBAC (Admin Keu, Admin Proyek, Operator Op, Operator Mat, Auditor)
   - Bottom bar 5 tab: Dashboard | Input | Absensi | Rekap | Akun
   - Search global + Quick tags
   - Form transaksi sheet-first, file belakangan (deferred)
   - Offline queue (IndexedDB -> localStorage)
   - Kompresi adaptif (canvas) + limit >1MB ke antrian
   - Picker modal + Preview modal + Toast/Loading
   ============================================================ */

/* ================== KONFIG & KONSTAN ================== */
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxWzUyMEIW7bZbjcy73QLI0aSJvwPa0SEIXIE5x0Vkks_JktmZD52OSvgsHgBq-vr66Kw/exec'; // ganti kalau beda
const EXIT_FALLBACK_URL = 'about:blank';

// batas & kompresi
const ONE_MB = 1024 * 1024;
const INLINE_LIMIT = ONE_MB;         // file <= 1MB ikut payload metadata
const MAX_FILES_PER_TX = 5;          // jaga memori di mobile
const MAX_PREVIEW_THUMBS = 8;

// role → kontrol UI
const ROLE = {
  ADMIN_KEU: 'admin_keu',
  ADMIN_PROYEK: 'admin_proyek',
  OP_OPS: 'op_ops',
  OP_MAT: 'op_mat',
  AUDITOR: 'auditor'
};

// state global ringan
const App = {
  me: null,              // {email, name, role}
  cfg: null,             // konfigurasi dropdown (proyek, vendor, profesi, dsb)
  currentTab: 'dashboard',
  noFakturGlobal: null,  // cache no faktur dari server
  queueReady: false
};

/* ================== ELEMEN INTI ================== */
// container layar
const viewDashboard = qs('#view-dashboard');
const viewInput     = qs('#view-input');
const viewAbsensi   = qs('#view-absensi');
const viewRekap     = qs('#view-rekap');
const viewAkun      = qs('#view-akun');

// bottom bar
const nav = {
  dashboard: qs('#nav-dashboard'),
  input:     qs('#nav-input'),
  absensi:   qs('#nav-absensi'),
  rekap:     qs('#nav-rekap'),
  akun:      qs('#nav-akun')
};

// top search
const qSearch = qs('#q');
const quickTagsWrap = qs('#quick-tags');

// form transaksi (view-input)
const f = {
  penginput:   qs('#f-penginput'),
  jenis:       qs('#f-jenis'),
  kategori:    qs('#f-kategori'),
  tanggal:     qs('#f-tanggal'),
  proyek:      qs('#f-proyek'),
  kreditor:    qs('#f-kreditor'),
  kreditorLain:qs('#f-kreditor-lain'),
  status:      qs('#f-status'),

  // umum
  uraianWrap:  qs('#wrap-uraian'),
  uraian:      qs('#f-uraian'),
  nominal:     qs('#f-nominal'),

  // material detail
  matWrap:     qs('#wrap-material'),
  noFaktur:    qs('#f-no-faktur'),
  namaBarang:  qs('#f-nama-barang'),
  hargaSatuan: qs('#f-harga-satuan'),
  qty:         qs('#f-qty'),
  totalHarga:  qs('#f-total'),

  // lampiran
  upBonWrap:   qs('#wrap-bon'),
  upSJWrap:    qs('#wrap-sj'),
  upUmumWrap:  qs('#wrap-umum'),
  upBon:       qs('#up-bon'),
  upSJ:        qs('#up-sj'),
  upUmum:      qs('#up-umum'),

  // tombol
  btnToPreview: qs('#btn-preview'),
  btnSaveRow:   qs('#btn-row-save'),     // tambah item material (satu faktur bisa banyak item)
  btnPrevRow:   qs('#btn-row-prev')      // kembali ke isi item sebelumnya
};

// preview modal
const modPreview = {
  backdrop: qs('#preview-backdrop'),
  body1: qs('#pv-pane-1'),
  body2: qs('#pv-pane-2'),
  tab1: qs('#pv-tab-1'),
  tab2: qs('#pv-tab-2'),
  btnBack: qs('#pv-back'),
  btnNext: qs('#pv-next'),
  thumbs: qs('#pv-thumbs'),
  empty: qs('#pv-empty'),
  // field ringkasan
  pv: id => qs('#pv-' + id),
  btnCancel: qs('#pv-cancel'),
  btnSend: qs('#pv-send')
};

// picker modal (dropdown popup)
const picker = {
  backdrop: qs('#picker-backdrop'),
  title: qs('#picker-title'),
  list: qs('#picker-list'),
  btnCancel: qs('#picker-cancel')
};

// loading & toast
const loading = {
  backdrop: qs('#loading-backdrop'),
  title: qs('#loading-title'),
  sub: qs('#loading-sub')
};
const toast = qs('#toast');

// kartu KPI (dashboard)
const kpi = id => qs(`#kpi-${id}`);

// grafik
let chartOut = null;

/* ================== UTIL MINI ================== */
function qs(s, el=document){ return el.querySelector(s); }
function qsa(s, el=document){ return [...el.querySelectorAll(s)]; }
function fmtIDR(n){
  const s = (n ?? 0).toString().replace(/[^\d\-]/g,'');
  const neg = s.startsWith('-'); const raw = s.replace('-','');
  return (neg?'-':'') + raw.replace(/\B(?=(\d{3})+(?!\d))/g,'.');
}
function nowISO(){ return new Date().toISOString(); }
function setHidden(el, v=true){ if(!el) return; el.classList.toggle('hidden', v); }
function setActive(el, v=true){ if(!el) return; el.classList.toggle('active', v); }
function showToast(msg, type='success', ms=2200){
  toast.textContent = msg; toast.className = `toast show ${type}`;
  setTimeout(()=> toast.className='toast', ms);
}
function showLoading(on=true, title='Memproses...', sub='Mohon tunggu'){
  if(!loading.backdrop) return;
  loading.title && (loading.title.textContent = title);
  loading.sub && (loading.sub.textContent = sub);
  setHidden(loading.backdrop, !on);
}
function netType(){
  const et = (navigator.connection && navigator.connection.effectiveType) || '';
  return (et || '').toLowerCase(); // 'slow-2g','2g','3g','4g','5g'
}

/* ================== INDEXEDDB QUEUE ================== */
const DB_NAME = 'portal-queue';
const DB_VER = 1;
let idb = null;

function idbOpen(){
  return new Promise(res=>{
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e=>{
      const db = e.target.result;
      if(!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', {keyPath:'key'});
      if(!db.objectStoreNames.contains('uploads')) db.createObjectStore('uploads', {keyPath:'id'});
    };
    req.onsuccess = e=>{ idb = e.target.result; App.queueReady = true; res(); };
    req.onerror = ()=>{ console.warn('IndexedDB gagal, fallback localStorage'); App.queueReady = false; res(); };
  });
}

function putUploadJob(job){ // {id, txId, whenISO, files:[{name,type,base64 or blobRef}]}
  if(!App.queueReady) return localStorage.setItem(`q:${job.id}`, JSON.stringify(job));
  return new Promise((res,rej)=>{
    const tx = idb.transaction('uploads','readwrite');
    tx.objectStore('uploads').put(job);
    tx.oncomplete = ()=>res();
    tx.onerror = ()=>rej(tx.error);
  });
}
function takeUploadJobs(limit=3){
  if(!App.queueReady){
    const keys = Object.keys(localStorage).filter(k=>k.startsWith('q:')).slice(0,limit);
    const jobs = keys.map(k=> JSON.parse(localStorage.getItem(k) || 'null')).filter(Boolean);
    keys.forEach(k=> localStorage.removeItem(k));
    return Promise.resolve(jobs);
  }
  return new Promise((res,rej)=>{
    const out = [];
    const tx = idb.transaction('uploads','readwrite');
    const store = tx.objectStore('uploads');
    const curReq = store.openCursor();
    curReq.onsuccess = e=>{
      const c = e.target.result;
      if(c && out.length < limit){ out.push(c.value); store.delete(c.key); c.continue(); }
    };
    tx.oncomplete = ()=>res(out);
    tx.onerror = ()=>rej(tx.error);
  });
}

/* ================== RBAC & AUTH RINGAN ================== */
function applyRBAC(){
  if(!App.me) return;
  // sembunyikan tombol input sesuai role
  // auditor: tidak boleh input apapun
  const canInput = ![ROLE.AUDITOR].includes(App.me.role);
  setHidden(qs('[data-ui="input-entry"]'), !canInput);
  setHidden(qs('[data-ui="absensi-entry"]'), !canInput);

  // operator material hanya menu material di input (kita kunci di form saat submit)
  // detail pembatasan dilakukan saat validasi sebelum kirim (lihat validateRoleBeforeSubmit)
}

function validateRoleBeforeSubmit(payload){
  const r = App.me?.role;
  if(!r) return {ok:false, msg:'Silakan login terlebih dulu.'};

  // contoh pembatasan:
  if(r === ROLE.OP_MAT){
    // hanya boleh Pengeluaran + Kategori Material
    if(!(payload.jenis==='Pengeluaran' && payload.kategori==='Material')){
      return {ok:false, msg:'Akses Anda hanya untuk penginputan Material (Pengeluaran).'};
    }
  }
  if(r === ROLE.OP_OPS){
    // tidak boleh Material
    if(payload.kategori==='Material'){
      return {ok:false, msg:'Akses Anda tidak mencakup penginputan Material.'};
    }
  }
  // admin proyek: boleh input absensi & progres; keuangan: semua
  return {ok:true};
}

/* ================== PICKER MODAL (DROPDOWN POPUP) ================== */
function bindPickerToSelect(selectEl){
  if(!selectEl) return;
  const wrap = document.createElement('div');
  wrap.className = 'nice-wrap';
  selectEl.classList.add('native-hidden');
  selectEl.parentNode.insertBefore(wrap, selectEl);
  wrap.appendChild(selectEl);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'select'; // pakai style input/select
  btn.textContent = selectEl.options[selectEl.selectedIndex]?.text || 'Pilih';
  wrap.appendChild(btn);

  const open = (e)=>{
    e.preventDefault();
    picker.title.textContent = selectEl.parentElement.querySelector('label')?.textContent || 'Pilih Opsi';
    picker.list.innerHTML = '';
    [...selectEl.options].forEach((opt, idx)=>{
      const d = document.createElement('div');
      d.className = 'picker-option' + (opt.selected ? ' selected' : '');
      d.textContent = opt.text;
      d.addEventListener('click', ()=>{
        selectEl.selectedIndex = idx;
        btn.textContent = opt.text;
        selectEl.dispatchEvent(new Event('change',{bubbles:true}));
        picker.backdrop.classList.remove('show');
      }, {passive:true});
      picker.list.appendChild(d);
    });
    picker.backdrop.classList.add('show');
  };
  btn.addEventListener('click', open);
  btn.addEventListener('touchstart', open, {passive:false});
}
picker.btnCancel && picker.btnCancel.addEventListener('click', ()=> picker.backdrop.classList.remove('show'));

/* ================== NAVIGASI 5 TAB ================== */
function showTab(key){
  App.currentTab = key;
  // aktifkan tombol
  Object.entries(nav).forEach(([k,el])=>{
    if(el) el.classList.toggle('active', k===key);
  });
  // tampilkan layar
  setHidden(viewDashboard, key!=='dashboard');
  setHidden(viewInput,     key!=='input');
  setHidden(viewAbsensi,   key!=='absensi');
  setHidden(viewRekap,     key!=='rekap');
  setHidden(viewAkun,      key!=='akun');

  if(key==='dashboard') refreshDashboard();
  if(key==='rekap')      refreshRekap();
}
Object.entries(nav).forEach(([k,el])=>{
  if(!el) return;
  el.addEventListener('click', (e)=>{ e.preventDefault(); showTab(k); });
});

/* ================== FETCH HELPER ================== */
function gasGet(params){
  const url = GAS_URL + '?' + new URLSearchParams(params).toString();
  return fetch(url, {method:'GET'}).then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); });
}
function gasPost(body){
  return fetch(GAS_URL, {
    method:'POST',
    headers:{'Content-Type':'text/plain;charset=UTF-8'},
    body: JSON.stringify(body)
  }).then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); });
}

/* ================== DASHBOARD ================== */
async function refreshDashboard(){
  try{
    const data = await gasGet({action:'dashboard.summary'});
    // KPI 2x2
    kpi('hari-proyek')   && (kpi('hari-proyek').textContent = data.hariProyek ?? '-');
    kpi('pengeluaran')   && (kpi('pengeluaran').textContent = 'Rp ' + fmtIDR(data.totalKeluar ?? 0));
    kpi('pemasukan')     && (kpi('pemasukan').textContent   = 'Rp ' + fmtIDR(data.totalMasuk ?? 0));
    kpi('utang')         && (kpi('utang').textContent       = 'Rp ' + fmtIDR(data.totalUtang ?? 0));
    // kartu ringkas
    qs('#today-saldo')   && (qs('#today-saldo').textContent = 'Rp ' + fmtIDR(data.saldoHariIni ?? 0));
    qs('#today-tagihan') && (qs('#today-tagihan').textContent = 'Rp ' + fmtIDR(data.tagihanHariIni ?? 0));
    qs('#today-keluar')  && (qs('#today-keluar').textContent  = 'Rp ' + fmtIDR(data.keluarHariIni ?? 0));

    // grafik
    const ctx = qs('#chart-pengeluaran');
    if(ctx && window.Chart){
      if(chartOut) chartOut.destroy();
      chartOut = new Chart(ctx, {
        type:'bar',
        data:{
          labels: data.outChart?.labels || [],
          datasets:[{label:'Pengeluaran', data: data.outChart?.values || []}]
        },
        options:{responsive:true, maintainAspectRatio:false}
      });
    }
  }catch(e){ console.error(e); showToast('Gagal memuat dashboard','error'); }
}

/* ================== SEARCH & TAG CEPAT ================== */
qSearch && qSearch.addEventListener('input', debounce(()=>{
  const q = (qSearch.value||'').trim();
  // panggil GAS pencarian global -> tampilkan hasil di list #global-results
  doGlobalSearch(q);
}, 300));

async function doGlobalSearch(q){
  const list = qs('#global-results');
  if(!list) return;
  list.innerHTML = '';
  if(!q){ return; }
  try{
    const res = await gasGet({action:'search.global', q});
    const rows = res.rows || [];
    rows.slice(0,50).forEach(r=>{
      const item = el('div','item');
      const l = el('div','l');
      l.append(el('div','title', r.title || '-'));
      l.append(el('div','meta', r.meta || ''));
      const amt = el('div','chip ' + (r.type==='keluar'?'bad':'ok'), r.amount || '');
      item.append(l, amt);
      list.append(item);
    });
  }catch(e){ console.warn(e); }
}

// helper DOM mini
function el(tag, cls, txt){ const d=document.createElement(tag); if(cls) d.className=cls; if(txt!=null) d.textContent=txt; return d; }
function debounce(fn,ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }

/* ================== FORM INPUT – MATERIAL & UMUM ================== */
function bindInputUI(){
  // picker untuk semua select[data-nice]
  qsa('select[data-nice]').forEach(bindPickerToSelect);

  // kreditor lainnya
  if(f.kreditor){
    f.kreditor.addEventListener('change', ()=>{
      if(f.kreditor.value==='__OTHER__'){ setHidden(f.kreditorLain,false); f.kreditorLain.focus(); }
      else { setHidden(f.kreditorLain,true); f.kreditorLain.value=''; }
    });
  }

  // format rupiah
  if(f.nominal) f.nominal.addEventListener('input', ()=> f.nominal.value = fmtIDR(f.nominal.value));
  if(f.hargaSatuan) f.hargaSatuan.addEventListener('input', ()=>{ f.hargaSatuan.value=fmtIDR(f.hargaSatuan.value); calcTotal(); });
  if(f.qty) f.qty.addEventListener('input', calcTotal);

  // toggle blok material
  [f.kategori, f.jenis].forEach(sel=>{
    sel && sel.addEventListener('change', toggleMaterialBlock);
  });

  // tombol preview
  f.btnToPreview && f.btnToPreview.addEventListener('click', openPreview);

  // tombol tambah item (multi-barang dalam faktur)
  f.btnSaveRow && f.btnSaveRow.addEventListener('click', addMaterialRow);
  f.btnPrevRow && f.btnPrevRow.addEventListener('click', prevMaterialRow);
}

function toggleMaterialBlock(){
  const isMat = (f.kategori?.value==='Material' && f.jenis?.value==='Pengeluaran');
  setHidden(f.matWrap, !isMat);
  setHidden(f.uraianWrap, isMat);
  // lampiran
  setHidden(f.upBonWrap, !isMat);
  setHidden(f.upSJWrap, !isMat);
  setHidden(f.upUmumWrap, isMat);
  // no faktur isi otomatis jika kosong
  if(isMat && f.noFaktur && !f.noFaktur.value) autofillNoFaktur();
}

function calcTotal(){
  const hs = parseInt((f.hargaSatuan?.value || '0').replace(/[^\d]/g,''))||0;
  const q  = parseInt(f.qty?.value || '0')||0;
  const t  = hs * q;
  if(f.totalHarga) f.totalHarga.value = t ? fmtIDR(t) : '';
}

/* ====== NO FAKTUR GLOBAL ====== */
async function autofillNoFaktur(){
  if(App.noFakturGlobal){ f.noFaktur.value = App.noFakturGlobal; return; }
  try{
    const r = await gasGet({action:'nofaktur.next'});
    App.noFakturGlobal = r?.noFaktur || ('FAK-' + Date.now().toString(36).toUpperCase());
    f.noFaktur.value = App.noFakturGlobal;
  }catch{ f.noFaktur.value = 'FAK-' + Date.now().toString(36).toUpperCase(); }
}

/* ====== MATERIAL MULTI-ROW (client buffer) ====== */
const MatBuf = []; // {namaBarang, hargaSatuan, qty, total}
function addMaterialRow(){
  // validasi ringkas
  const nb = (f.namaBarang?.value||'').trim();
  const hs = parseInt((f.hargaSatuan?.value||'').replace(/[^\d]/g,''))||0;
  const q  = parseInt(f.qty?.value||'0')||0;
  if(!nb || !hs || !q) return showToast('Lengkapi item material','error');

  const tot = hs*q;
  MatBuf.push({namaBarang:nb, hargaSatuan:hs, qty:q, total:tot});
  // render list kecil
  renderMatList();

  // reset field barang (bukan faktur)
  f.namaBarang.value=''; f.hargaSatuan.value=''; f.qty.value=''; f.totalHarga.value='';
  showToast('Item ditambahkan');
}
function prevMaterialRow(){
  if(!MatBuf.length) return showToast('Belum ada item','error');
  const last = MatBuf.pop();
  // kembalikan ke field utk koreksi
  f.namaBarang.value = last.namaBarang;
  f.hargaSatuan.value = fmtIDR(last.hargaSatuan);
  f.qty.value = last.qty;
  calcTotal();
  renderMatList();
}
function renderMatList(){
  const wrap = qs('#mat-list'); if(!wrap) return;
  wrap.innerHTML = '';
  let sum = 0;
  MatBuf.forEach((it, i)=>{
    sum += it.total;
    const row = el('div','item');
    const left = el('div','l');
    left.append(el('div','title', `${i+1}. ${it.namaBarang}`));
    left.append(el('div','meta', `Qty ${it.qty} @Rp ${fmtIDR(it.hargaSatuan)}`));
    const r = el('div','chip ok', 'Rp '+fmtIDR(it.total));
    row.append(left, r); wrap.append(row);
  });
  // isi nominal total faktur ke field nominal (disembunyikan utk material)
  if(f.nominal) f.nominal.value = fmtIDR(sum);
}

/* ================== PREVIEW MODAL ================== */
function openPreview(){
  // validasi dasar
  if(!f.tanggal?.value)  return showToast('Isi tanggal','error');
  if(!f.proyek?.value)   return showToast('Pilih proyek','error');
  if(!f.jenis?.value)    return showToast('Pilih jenis','error');
  if(!f.kategori?.value) return showToast('Pilih kategori','error');

  const isMat = (f.kategori.value==='Material' && f.jenis.value==='Pengeluaran');
  if(isMat){
    if(!f.noFaktur?.value) return showToast('Nomor faktur kosong','error');
    if(MatBuf.length===0)  return showToast('Tambahkan minimal 1 item','error');
  }else{
    if(!f.uraian?.value) return showToast('Isi uraian','error');
    if(!f.nominal?.value) return showToast('Isi nominal','error');
  }

  // ringkasan
  setPV('penginput', f.penginput?.value);
  setPV('jenis', f.jenis?.value);
  setPV('kategori', f.kategori?.value);
  setPV('tanggal', f.tanggal?.value);
  setPV('proyek', f.proyek?.value);
  setPV('kreditor', (f.kreditor?.value==='__OTHER__' ? (f.kreditorLain?.value||'') : f.kreditor?.value)||'-');
  setPV('status', f.status?.value);

  // uraian / material
  if(isMat){
    setPV('uraian', '-');
    setPV('mat', `${f.noFaktur?.value} • ${MatBuf.length} item • Total Rp ${fmtIDR((f.nominal?.value||'').replace(/[^\d]/g,''))}`);
    setHidden(qs('#pv-mat-row'), false);
  }else{
    setPV('uraian', f.uraian?.value);
    setHidden(qs('#pv-mat-row'), true);
  }

  // nominal tampil untuk semua
  setPV('nominal', 'Rp ' + fmtIDR((f.nominal?.value||'').replace(/[^\d]/g,'')));

  // thumbnails
  renderPreviewThumbs(isMat);

  // buka modal
  setActive(modPreview.body1, true);
  setActive(modPreview.body2, false);
  setActive(modPreview.tab1, true);
  setActive(modPreview.tab2, false);
  setHidden(modPreview.btnBack, true);
  setHidden(modPreview.btnNext, false);
  setHidden(modPreview.backdrop, false);
}
function setPV(id, val){ const t = modPreview.pv(id); if(t) t.textContent = val || '-'; }

function renderPreviewThumbs(isMat){
  if(!modPreview.thumbs || !modPreview.empty) return;
  modPreview.thumbs.innerHTML = '';
  const files = collectFiles(isMat).slice(0, MAX_PREVIEW_THUMBS);
  if(files.length===0){
    setHidden(modPreview.empty, false);
    return;
  }
  setHidden(modPreview.empty, true);
  files.forEach(f=>{
    const box = el('div','item');
    const l = el('div','l');
    l.append(el('div','title', f.name||'file'));
    l.append(el('div','meta', (f.type||'').split('/')[1] || 'unknown'));
    const r = el('div','chip', Math.ceil((f.size||0)/1024)+' KB');
    box.append(l,r);
    modPreview.thumbs.append(box);
  });
}

// tab di preview
modPreview.tab1 && modPreview.tab1.addEventListener('click', ()=>{
  setActive(modPreview.body1, true); setActive(modPreview.body2, false);
  setActive(modPreview.tab1, true); setActive(modPreview.tab2, false);
  setHidden(modPreview.btnBack, true); setHidden(modPreview.btnNext, false);
});
modPreview.tab2 && modPreview.tab2.addEventListener('click', ()=>{
  setActive(modPreview.body1, false); setActive(modPreview.body2, true);
  setActive(modPreview.tab1, false); setActive(modPreview.tab2, true);
  setHidden(modPreview.btnBack, false); setHidden(modPreview.btnNext, true);
});
modPreview.btnBack && modPreview.btnBack.addEventListener('click', ()=> modPreview.tab1.click());
modPreview.btnNext && modPreview.btnNext.addEventListener('click', ()=> modPreview.tab2.click());
modPreview.btnCancel && modPreview.btnCancel.addEventListener('click', ()=> setHidden(modPreview.backdrop, true));
modPreview.btnSend && modPreview.btnSend.addEventListener('click', submitTransaction);

/* ================== FILE KOLEKSI + KOMPRESI ================== */
function collectFiles(isMat){
  if(isMat){
    const a = [...(f.upBon?.files||[])];
    const b = [...(f.upSJ?.files||[])];
    return [...a, ...b].slice(0, MAX_FILES_PER_TX);
  }else{
    return [...(f.upUmum?.files||[])].slice(0, MAX_FILES_PER_TX);
  }
}

async function compressIfNeeded(file){
  // hanya compress gambar; pdf biarkan
  if(!file || !file.type?.startsWith('image/')) return {blob:file, name:file.name, type:file.type, size:file.size};

  const et = netType();
  // target adaptif
  let maxW = 1600, q = 0.8;
  if(et==='slow-2g' || et==='2g'){ maxW = 900; q = 0.6; }
  if(et==='3g'){ maxW = 1200; q = 0.7; }

  const img = await createImageBitmap(file).catch(()=>null);
  if(!img) return {blob:file, name:file.name, type:file.type, size:file.size};

  const scale = Math.min(1, maxW / img.width);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const cnv = document.createElement('canvas'); cnv.width=w; cnv.height=h;
  const ctx = cnv.getContext('2d', {alpha:false});
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise(res=> cnv.toBlob(res, 'image/jpeg', q));
  const out = blob || file;
  return {blob: out, name: file.name.replace(/\.(png|jpeg|jpg|webp)$/i,'.jpg'), type:'image/jpeg', size: out.size};
}

function fileToBase64(blob){
  return new Promise(res=>{
    const fr = new FileReader();
    fr.onloadend = ()=> res((fr.result||'').toString().split(',')[1] || '');
    fr.readAsDataURL(blob);
  });
}

/* ================== SUBMIT – SHEET FIRST ================== */
async function submitTransaction(){
  setHidden(modPreview.backdrop, true);

  // siapkan payload metadata
  const isMat = (f.kategori?.value==='Material' && f.jenis?.value==='Pengeluaran');
  const kreditorFinal = (f.kreditor?.value==='__OTHER__') ? (f.kreditorLain?.value||'') : (f.kreditor?.value||'');

  const payload = {
    action: 'tx.create',
    penginput: f.penginput?.value || '',
    jenis:     f.jenis?.value || '',
    kategori:  f.kategori?.value || '',
    tanggal:   f.tanggal?.value || '',
    proyek:    f.proyek?.value || '',
    kreditor:  kreditorFinal,
    status:    f.status?.value || '',
    uraian:    isMat ? '' : (f.uraian?.value || ''),
    nominal:   (f.nominal?.value || '').replace(/[^\d]/g,'') || '0',
    material:  isMat ? { noFaktur: f.noFaktur?.value || '', items: MatBuf.slice() } : null,
    inlineFiles: [],   // <= 1MB (sudah kompres)
    deferred:   []     // > 1MB (antri)
  };

  // RBAC cek
  const rr = validateRoleBeforeSubmit(payload);
  if(!rr.ok){ showToast(rr.msg,'error',2600); return; }

  showLoading(true, 'Mengirim data...', 'Menyimpan ke Spreadsheet');

  // kumpulkan file & kompres
  const rawFiles = collectFiles(isMat);
  for (let i=0;i<rawFiles.length;i++){
    const f0 = rawFiles[i];
    const cf = await compressIfNeeded(f0);
    if(cf.size <= INLINE_LIMIT){
      const base64 = await fileToBase64(cf.blob);
      payload.inlineFiles.push({name: cf.name, type: cf.type, base64});
    }else{
      payload.deferred.push({name: cf.name, type: cf.type, size: cf.size}); // data besar → antri
    }
  }

  try{
    // 1) kirim metadata + inline files → dapat txId
    const res = await gasPost(payload);
    if(res.status!=='ok') throw new Error(res.error || 'Gagal menyimpan data');

    // 2) kalau ada deferred, masukkan ke antrian offline
    if((payload.deferred||[]).length){
      const job = {
        id: `UP-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`,
        txId: res.id,
        whenISO: nowISO(),
        files: await Promise.all(rawFiles.map(compressIfNeeded)) // compress ulang agar konsisten
                   .then(arr=> arr.filter(x=> x.size>INLINE_LIMIT))
                   .then(arr=> Promise.all(arr.map(async it=>{
                      const base64 = await fileToBase64(it.blob);
                      return {name: it.name, type: it.type, base64};
                   })))
      };
      await putUploadJob(job);
      // trigger background upload (best-effort)
      drainUploadQueue();
    }

    showLoading(false);
    // sukses UX
    const successIcon = `<div class="icon-wrap"><svg viewBox="0 0 52 52"><path class="stroke" d="M14 27 l8 8 l16 -18"/></svg></div>`;
    openResultModal('Sukses', 'Data berhasil tersimpan. Berkas besar akan diunggah saat koneksi siap.', successIcon, true);
    // reset form ringan
    resetInputForm();

  }catch(e){
    console.error(e);
    showLoading(false);
    const errIcon = `<div class="icon-wrap error"><svg viewBox="0 0 52 52"><path class="stroke" d="M16 16 L36 36"/><path class="stroke" d="M36 16 L16 36"/></svg></div>`;
    openResultModal('Gagal', e.message || 'Gagal menyimpan', errIcon, false);
  }
}

/* =========== RESULT MODAL SEDERHANA =========== */
function openResultModal(title, msg, iconHTML, success){
  const bd = qs('#result-backdrop');
  const ic = qs('#result-icon');
  const h  = qs('#result-title');
  const p  = qs('#result-msg');
  const btnExit = qs('#btn-exit');
  const btnAgain= qs('#btn-again');

  if(!bd) return showToast(msg, success?'success':'error', 2600);
  ic.innerHTML = iconHTML || '';
  h.textContent = title || (success?'Sukses':'Kesalahan');
  p.textContent = msg || '';
  setHidden(btnAgain, !success);
  // exit: hanya keluar tab saat sukses (sesuai revisi)
  btnExit.onclick = success ? exitApp : ()=> setHidden(bd, true);
  btnAgain.onclick = ()=>{ setHidden(bd,true); showTab('input'); };
  setHidden(bd, false);
}
function exitApp(){
  window.open('','_self'); window.close();
  setTimeout(()=>{ if(document.visibilityState!=='hidden'){ location.replace(EXIT_FALLBACK_URL); } }, 100);
}

/* =========== DRAIN UPLOAD QUEUE (BACKGROUND) =========== */
let draining = false;
async function drainUploadQueue(){
  if(draining) return; draining = true;
  try{
    showLoading(true, 'Mengunggah berkas...', 'Proses latar belakang');
    const jobs = await takeUploadJobs(2);
    for(const job of jobs){
      try{
        await gasPost({action:'tx.upload', id: job.txId, files: job.files});
      }catch(e){
        console.warn('Upload gagal, kembalikan ke antrian', e);
        await putUploadJob(job); // taruh lagi jika gagal
      }
    }
  }finally{
    showLoading(false);
    draining = false;
  }
}

/* =========== REKAP & ABSENSI PLACEHOLDER (WIRING) =========== */
async function refreshRekap(){
  // isi ringkas rekap default (mingguan). Detail diimplementasi backend.
  try{
    const data = await gasGet({action:'rekap.default'});
    const list = qs('#rekap-list');
    if(list){
      list.innerHTML = '';
      (data.rows||[]).slice(0,50).forEach(r=>{
        const it = el('div','item');
        const l = el('div','l');
        l.append(el('div','title', r.title||'-'));
        l.append(el('div','meta', r.meta||''));
        const amt = el('div','chip ' + (r.type==='keluar'?'bad':'ok'), r.amount||'');
        it.append(l, amt);
        list.append(it);
      });
    }
  }catch(e){ console.warn(e); }
}

/* =========== FORM HELPERS =========== */
function resetInputForm(){
  // kosongkan semua input, kecuali dropdown penginput/jenis/kategori agar alur cepat
  f.tanggal && (f.tanggal.value = '');
  f.proyek  && (f.proyek.selectedIndex = 0);
  f.kreditor && (f.kreditor.selectedIndex = 0);
  f.kreditorLain && (f.kreditorLain.value='');
  f.status && (f.status.selectedIndex = 0);
  f.uraian && (f.uraian.value='');
  f.nominal && (f.nominal.value='');
  if(f.upBon)  f.upBon.value='';
  if(f.upSJ)   f.upSJ.value='';
  if(f.upUmum) f.upUmum.value='';
  MatBuf.length = 0; renderMatList();
}

/* =========== INIT =========== */
async function boot(){
  // buka IDB
  await idbOpen();

  // (opsional) mock login lokal bila belum ada
  const raw = localStorage.getItem('me');
  if(raw) App.me = JSON.parse(raw);
  // kalau belum, fallback role operator material agar bisa demo
  if(!App.me){ App.me = {email:'demo@local', name:'Demo', role:ROLE.ADMIN_KEU}; localStorage.setItem('me', JSON.stringify(App.me)); }

  applyRBAC();

  // load config dropdown (proyek, vendor, profesi)
  try{
    App.cfg = await gasGet({action:'config.get'});
    // isi dropdown proyek/kreditor/penginput/status
    fillSelect(f.penginput, App.cfg.penginput);
    fillSelect(f.jenis,     ['Pengeluaran','Pembayaran','Pemasukan']);
    fillSelect(f.kategori,  ['Material','Operasional','Upah','Lainnya']);
    fillSelect(f.proyek,    App.cfg.proyek);
    fillSelect(f.kreditor,  [...(App.cfg.vendor||[]), {value:'__OTHER__',label:'Lainnya… (ketik sendiri)'}]);
    fillSelect(f.status,    ['Sudah Dibayar','Belum Dibayar']);
    // bind picker untuk select baru
    qsa('select[data-nice]').forEach(bindPickerToSelect);
  }catch(e){ console.warn('config.get gagal', e); }

  bindInputUI();
  toggleMaterialBlock();
  showTab('dashboard');

  // coba jalankan antrian upload di awal (misal dari sesi sebelumnya)
  drainUploadQueue();
}
function fillSelect(sel, arr){
  if(!sel || !arr) return;
  sel.innerHTML = '';
  arr.forEach(item=>{
    if(typeof item === 'string'){
      const opt = document.createElement('option'); opt.value = item; opt.textContent = item;
      sel.appendChild(opt);
    }else{
      const opt = document.createElement('option'); opt.value = item.value; opt.textContent = item.label || item.value;
      sel.appendChild(opt);
    }
  });
}

document.addEventListener('DOMContentLoaded', boot);

/* =========== AKUN (LOGOUT/MODE) =========== */
const btnLogout = qs('#btn-logout');
btnLogout && btnLogout.addEventListener('click', ()=>{
  localStorage.removeItem('me');
  showToast('Logout berhasil');
  setTimeout(()=> location.reload(), 600);
});

/* =========== UTIL TAMBAHAN =========== */
function exitTo(url){ try{ window.location.href = url; }catch{ location.replace(url); } }

