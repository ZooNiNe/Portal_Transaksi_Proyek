/***** ==================== KONFIG GLOBAL ==================== *****/
const scriptURL = 'https://script.google.com/macros/s/AKfycbzgod3bBBFmKBqlgyW_4oPUkCTUsaqznDV-JxPPNSac7BtTbOaMSZoBN-Y_WGaDeFj9sQ/exec';
const EXIT_FALLBACK_URL = 'about:blank';
const ONE_MB = 1024 * 1024;
const MAX_EACH_MB = 5;
const ALLOWED_MIME_PREFIX = ['image/', 'application/pdf'];

/***** ==================== ELEM SECTION (AMAN JIKA TIDAK ADA) ==================== *****/
const home   = document.getElementById('home');   // dashboard (opsional)
const step1  = document.getElementById('step1');  // landing 1
const step2  = document.getElementById('step2');  // landing 2
const step3  = document.getElementById('step3');  // landing 3

/***** ==================== DASHBOARD (OPSIONAL) ==================== *****/
const dashCards  = document.getElementById('dash-cards');
const chartCanv  = document.getElementById('chartPengeluaran');
const btnRefresh = document.getElementById('btnRefresh');
const btnGotoInput = document.getElementById('gotoInput');

if (btnGotoInput) btnGotoInput.addEventListener('click', ()=>go(1));
if (btnRefresh) btnRefresh.addEventListener('click', loadDashboard);

let chartPengeluaran;
function loadDashboard(){
  if (!dashCards) return;
  fetch(`${scriptURL}?action=dashboard.summary`, {method:'GET'})
    .then(r=>r.json())
    .then(d=>{
      const items = [
        {label:'Total Pendapatan', val: d.totalPendapatan ?? '-'},
        {label:'Biaya Material',   val: d.totalMaterial ?? '-'},
        {label:'Biaya Gaji',       val: d.totalGaji ?? '-'},
        {label:'Kas Saat Ini',     val: d.kas ?? '-'},
        {label:'Estimasi Bersih',  val: d.estimasi ?? '-'},
      ];
      dashCards.innerHTML = items.map(it=>{
        return `
          <div class="kpi">
            <div class="label">${it.label}</div>
            <div class="val">${formatIDR(it.val)}</div>
          </div>`;
      }).join('');

      if (chartCanv && window.Chart){
        if (chartPengeluaran) chartPengeluaran.destroy();
        const labels = d.chart?.labels || [];
        const values = d.chart?.values || [];
        chartPengeluaran = new Chart(chartCanv, {
          type:'bar',
          data:{
            labels,
            datasets:[{label:'Pengeluaran', data: values}]
          },
          options:{ responsive:true, maintainAspectRatio:false }
        });
      }
    })
    .catch(console.error);
}
document.addEventListener('DOMContentLoaded', loadDashboard);

/***** ==================== STEP 1 ==================== *****/
const penginputSel   = document.getElementById('penginput');
const jenisSel       = document.getElementById('jenis');
const kategoriAwalSel= document.getElementById('kategoriAwal');

const btnToStep2 = document.getElementById('toStep2');
if (btnToStep2){
  const goto2 = (e)=>{ e.preventDefault(); go(2); };
  btnToStep2.addEventListener('click', goto2);
  btnToStep2.addEventListener('touchend', goto2, {passive:false});
}

/***** ==================== STEP 2 ==================== *****/
const tanggal  = document.getElementById('tanggal');
const proyek   = document.getElementById('proyek');

const wrapUraian = document.getElementById('wrapUraian');
const uraian   = document.getElementById('uraian');

const nominal  = document.getElementById('nominal');      // akan disembunyikan pada Material
const kreditor = document.getElementById('kreditor');
const kreditorLain = document.getElementById('kreditorLain');
const statusSel= document.getElementById('status');

/* ======= BLOK MATERIAL: FAKTUR GLOBAL + MULTI ITEM ======= */
const materialBlock = document.getElementById('materialBlock'); // container
const noFaktur      = document.getElementById('noFaktur');      // auto dari server
const itemsWrap     = document.getElementById('itemsWrap');     // container list item
const btnAddItem    = document.getElementById('btnAddItem');
const btnPrevItem   = document.getElementById('btnPrevItem');   // opsional (kembali)
const fakturTotalEl = document.getElementById('fakturTotal');   // total faktur

// item template referensi (input kecil) — ID dinamis
function newItemRow(idx){
  const row = document.createElement('div');
  row.className = 'item-row';
  row.dataset.idx = String(idx);
  row.innerHTML = `
    <input class="input small" type="text"  placeholder="Nama barang" data-role="nama"/>
    <input class="input small" type="text"  placeholder="Harga satuan" inputmode="numeric" data-role="harga"/>
    <input class="input small" type="number" placeholder="Qty" min="0" step="1" data-role="qty"/>
    <input class="input small" type="text"  placeholder="Total" data-role="total" disabled/>
    <button class="del" type="button" title="Hapus">×</button>
  `;
  const hargaEl = row.querySelector('[data-role="harga"]');
  const qtyEl   = row.querySelector('[data-role="qty"]');
  const totalEl = row.querySelector('[data-role="total"]');
  const delBtn  = row.querySelector('.del');

  const recalc = ()=>{
    hargaEl.value = toIDR(hargaEl.value);
    const hs = parseInt((hargaEl.value||'').replace(/\./g,''))||0;
    const q  = parseInt(qtyEl.value||0);
    const t  = hs * q;
    totalEl.value = t ? toIDR(String(t)) : '';
    recalcFakturTotal();
  };

  hargaEl.addEventListener('input', recalc);
  qtyEl.addEventListener('input', recalc);
  delBtn.addEventListener('click', ()=>{
    row.remove();
    recalcFakturTotal();
  });

  return row;
}

function addItemRow(){
  const idx = (itemsWrap?.children.length || 0) + 1;
  itemsWrap.appendChild(newItemRow(idx));
  recalcFakturTotal();
}

function getAllItems(){
  const out = [];
  if (!itemsWrap) return out;
  [...itemsWrap.children].forEach(row=>{
    const nama  = row.querySelector('[data-role="nama"]')?.value?.trim() || '';
    const harga = row.querySelector('[data-role="harga"]')?.value || '';
    const qty   = row.querySelector('[data-role="qty"]')?.value || '0';
    const total = row.querySelector('[data-role="total"]')?.value || '';
    if (!nama && !harga && !qty) return;
    out.push({
      nama,
      hargaSatuan: (harga||'').replace(/\./g,''),
      qty: parseInt(qty||0),
      total: (total||'').replace(/\./g,'')
    });
  });
  return out;
}

function recalcFakturTotal(){
  const items = getAllItems();
  const sum = items.reduce((a,c)=> a + (parseInt(c.total||0) || (parseInt(c.hargaSatuan||0)* (c.qty||0))), 0);
  if (fakturTotalEl) fakturTotalEl.textContent = sum ? 'Rp ' + toIDR(String(sum)) : 'Rp 0';
  // sinkron ke nominal (kolom nominal disembunyikan untuk material)
  if (nominal) nominal.value = sum ? toIDR(String(sum)) : '';
}

if (btnAddItem)  btnAddItem.addEventListener('click', (e)=>{ e.preventDefault(); addItemRow(); });
if (btnPrevItem) btnPrevItem.addEventListener('click', (e)=>{ e.preventDefault(); /* opsional: navigasi back antar langkah item */ });

/* ======= FAKTUR GLOBAL AUTO-NUMBER ======= */
async function ensureNoFaktur(){
  try{
    const res = await fetch(`${scriptURL}?action=getNoFaktur.counter`, {method:'GET'});
    const js  = await res.json();
    if (noFaktur && js?.noFaktur) {
      noFaktur.value = js.noFaktur;
      noFaktur.readOnly = true;
    }
  }catch(e){ console.warn('Gagal ambil nomor faktur:', e); }
}

/* ======= TOGGLE MODE MATERIAL vs UMUM ======= */
function toggleMaterialBlock(){
  const isMaterial = (kategoriAwalSel?.value === 'Material' && jenisSel?.value === 'Pengeluaran');
  if (materialBlock) materialBlock.classList.toggle('hidden', !isMaterial);
  if (wrapUraian)    wrapUraian.classList.toggle('hidden', isMaterial);
  if (nominal)       nominal.parentElement?.classList.toggle('hidden', isMaterial); // nominal di-hide kalau material
  if (isMaterial){
    // jika belum ada baris, tambah 1
    if (itemsWrap && itemsWrap.children.length === 0) addItemRow();
    ensureNoFaktur();
  }
}
if (jenisSel) jenisSel.addEventListener('change', toggleMaterialBlock);
if (kategoriAwalSel) kategoriAwalSel.addEventListener('change', toggleMaterialBlock);

/* ======= KREDITOR LAINNYA ======= */
if (kreditor) {
  kreditor.addEventListener('change', ()=>{
    if (kreditor.value === '__OTHER__'){
      kreditorLain?.classList.remove('hidden');
      kreditorLain?.focus();
    } else {
      kreditorLain?.classList.add('hidden');
      if (kreditorLain) kreditorLain.value = '';
    }
  });
}

/* ======= FORMAT RUPIAH ======= */
function toIDR(v){ return (v||'').toString().replace(/[^\d]/g,'').replace(/\B(?=(\d{3})+(?!\d))/g,'.'); }
function formatIDR(n){
  if (n===null || n===undefined || n==='') return '-';
  const num = Number(String(n).replace(/[^\d\-]/g,'')) || 0;
  return 'Rp ' + num.toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.');
}
if (nominal) nominal.addEventListener('input', ()=> nominal.value = toIDR(nominal.value));

/* ======= NAV STEP ======= */
const STATE = { penginput:'', jenis:'', kategori:'' };

function go(n){
  if (home)  home.classList.toggle('hidden', n !== 0);
  if (step1) step1.classList.toggle('hidden', n !== 1);
  if (step2) step2.classList.toggle('hidden', n !== 2);
  if (step3) step3.classList.toggle('hidden', n !== 3);

  if (n===1) window.scrollTo({top:0, behavior:'smooth'});
  if (n===2){
    // capture state & siapkan UI
    if (penginputSel)   STATE.penginput = penginputSel.value;
    if (jenisSel)       STATE.jenis     = jenisSel.value;
    if (kategoriAwalSel)STATE.kategori  = kategoriAwalSel.value;
    toggleMaterialBlock();
  }
}
document.addEventListener('DOMContentLoaded', ()=>{ if (home) go(0); });

/***** ==================== STEP 2 → STEP 3 VALIDASI ==================== *****/
const btnBackTo1 = document.getElementById('backTo1');
const btnToStep3 = document.getElementById('toStep3');
if (btnBackTo1) btnBackTo1.addEventListener('click',(e)=>{ e.preventDefault(); go(1); });
if (btnToStep3) btnToStep3.addEventListener('click',(e)=>{
  e.preventDefault();
  if (!tanggal?.value) return quickPop('Isi Tanggal.');
  if (!proyek?.value)  return quickPop('Pilih Proyek.');

  const isMat = (kategoriAwalSel?.value==='Material' && jenisSel?.value==='Pengeluaran');
  if (isMat){
    if (!noFaktur?.value) return quickPop('Nomor Faktur belum tersedia.');
    const items = getAllItems();
    if (items.length === 0) return quickPop('Tambahkan minimal 1 item material.');
    const adaKosong = items.some(it => !it.nama || !it.hargaSatuan || !it.qty);
    if (adaKosong) return quickPop('Nama/Harga/Qty item belum lengkap.');
    // nominal otomatis dari total
    recalcFakturTotal();
  }else{
    if (!uraian?.value) return quickPop('Isi Uraian.');
    if (!nominal?.value) return quickPop('Isi Nominal.');
  }
  prepareUploadSection();
  go(3);
});

/***** ==================== STEP 3 (UPLOAD) ==================== *****/
const wrapBon  = document.getElementById('wrapBon');
const wrapSJ   = document.getElementById('wrapSJ');
const wrapUmum = document.getElementById('wrapBuktiUmum');

const btnBackTo2 = document.getElementById('backTo2');
const btnOpenPreview = document.getElementById('openPreview');
if (btnBackTo2) btnBackTo2.addEventListener('click',(e)=>{ e.preventDefault(); go(2); });
if (btnOpenPreview) btnOpenPreview.addEventListener('click', openPreview);

function prepareUploadSection(){
  const isMatPeng = (kategoriAwalSel?.value==='Material' && jenisSel?.value==='Pengeluaran');
  if (wrapBon)  wrapBon.classList.toggle('hidden', !isMatPeng);
  if (wrapSJ)   wrapSJ.classList.toggle('hidden', !isMatPeng);
  if (wrapUmum) wrapUmum.classList.toggle('hidden', isMatPeng);
}

/***** ==================== PREVIEW MODAL (2 TAB) ==================== *****/
const previewModal = document.getElementById('previewModal');
const cancelBtn    = document.getElementById('cancel-btn');
const confirmBtn   = document.getElementById('confirm-btn');

if (cancelBtn)  cancelBtn.addEventListener('click', ()=> previewModal?.classList.remove('active'));
if (confirmBtn) confirmBtn.addEventListener('click', sendData);

const pvStep1 = document.getElementById('pvStep1');
const pvStep2 = document.getElementById('pvStep2');
const pvTab1  = document.getElementById('pvTab1');
const pvTab2  = document.getElementById('pvTab2');
const pvBack  = document.getElementById('pvBack');
const pvNext  = document.getElementById('pvNext');

if (pvTab1) pvTab1.addEventListener('click', ()=>showPv(1));
if (pvTab2) pvTab2.addEventListener('click', ()=>showPv(2));
if (pvBack) pvBack.addEventListener('click', ()=>showPv(1));
if (pvNext) pvNext.addEventListener('click', ()=>showPv(2));

function showPv(n){
  const isOne = (n===1);
  pvStep1?.classList.toggle('active', isOne);
  pvStep2?.classList.toggle('active', !isOne);
  pvTab1?.classList.toggle('active', isOne);
  pvTab2?.classList.toggle('active', !isOne);
  pvBack?.classList.toggle('hidden', isOne);
  pvNext?.classList.toggle('hidden', !isOne);
}

function setText(id, v){ const el = document.getElementById(id); if (el) el.textContent = v || '-'; }

function fileListForPreview(){
  const isMat = (kategoriAwalSel?.value==='Material' && jenisSel?.value==='Pengeluaran');
  if (isMat){
    return [
      ...(document.getElementById('buktiBon')?.files || []),
      ...(document.getElementById('buktiSJ')?.files || [])
    ];
  } else {
    return [ ...(document.getElementById('buktiUmum')?.files || []) ];
  }
}

function validateFileList(fileList, label){
  const files = [...(fileList||[])];
  for (const f of files){
    const okType = ALLOWED_MIME_PREFIX.some(p => (f.type||'').startsWith(p));
    const okSize = f.size <= MAX_EACH_MB * ONE_MB;
    if (!okType) return quickPop(`${label}: ${f.name} bertipe tidak didukung.`);
    if (!okSize) return quickPop(`${label}: ${f.name} > ${MAX_EACH_MB}MB.`);
  }
  return true;
}

function openPreview(){
  const kreditorFinal = (kreditor?.value === '__OTHER__') ? (kreditorLain?.value||'').trim() : (kreditor?.value||'');
  if (kreditor && kreditor.value === '__OTHER__' && !kreditorFinal) return quickPop('Isi Kreditor/Supplier.');

  const isMat = (kategoriAwalSel?.value==='Material' && jenisSel?.value==='Pengeluaran');
  let ok = true;
  if (isMat){
    ok = validateFileList(document.getElementById('buktiBon')?.files, 'Bukti Bon') &&
         validateFileList(document.getElementById('buktiSJ')?.files,  'Bukti Surat Jalan');
  } else {
    ok = validateFileList(document.getElementById('buktiUmum')?.files, 'Bukti Transaksi');
  }
  if (!ok) return;

  // Ringkasan
  setText('pv-penginput',   penginputSel?.value);
  setText('pv-jenis',       jenisSel?.value);
  setText('pv-kategori',    kategoriAwalSel?.value);
  setText('pv-tanggal',     tanggal?.value);
  setText('pv-proyek',      proyek?.value);

  const matLabel = document.getElementById('pv-mat-label');
  const matValue = document.getElementById('pv-mat-value');

  if (isMat){
    // gabung ringkasan item
    const items = getAllItems();
    const lines = items.map(it=>{
      const nm = it.nama || '-';
      const hs = it.hargaSatuan ? formatIDR(it.hargaSatuan) : 'Rp 0';
      const q  = it.qty || 0;
      const tt = it.total ? formatIDR(it.total) : 'Rp 0';
      return `${nm} — ${hs} × ${q} = ${tt}`;
    });
    if (matLabel) matLabel.style.display = '';
    if (matValue){ matValue.style.display = ''; matValue.textContent = lines.join(' • '); }
    setText('pv-uraian', '-');
    // sinkron nominal dari total
    recalcFakturTotal();
  } else {
    if (matLabel) matLabel.style.display = 'none';
    if (matValue){ matValue.style.display = 'none'; matValue.textContent = ''; }
    setText('pv-uraian', uraian?.value);
  }

  setText('pv-nominal', nominal?.value ? `Rp ${nominal.value}` : '');
  setText('pv-kreditor', kreditorFinal || '-');
  setText('pv-status',   statusSel?.value);

  // Thumbs
  const thumbs = document.getElementById('pv-thumbs');
  const kosong = document.getElementById('pv-bukti-kosong');
  if (thumbs && kosong){
    thumbs.innerHTML = '';
    const files = fileListForPreview().slice(0, 12);
    if (files.length === 0){
      kosong.style.display = 'block';
    } else {
      kosong.style.display = 'none';
      files.forEach(f=>{
        const box = document.createElement('div'); box.className = 'thumb';
        if ((f.type||'').toLowerCase().startsWith('image/')){
          const img = document.createElement('img');
          const url = URL.createObjectURL(f);
          img.onload = ()=> URL.revokeObjectURL(url);
          img.src = url;
          box.appendChild(img);
        } else if (f.type === 'application/pdf'){
          box.classList.add('pdf');
        } else {
          box.textContent = f.name;
        }
        thumbs.appendChild(box);
      });
    }
  }

  showPv(1);
  previewModal?.classList.add('active');
}

/***** ==================== LOADING & RESULT ==================== *****/
const loadingPop = document.getElementById('loadingPop');
const resultPop  = document.getElementById('resultPop');
const resultIcon = document.getElementById('resultIcon');
const resultTitle= document.getElementById('resultTitle');
const resultMsg  = document.getElementById('resultMsg');
const btnKeluar  = document.getElementById('btnKeluar');
const btnInputKembali = document.getElementById('btnInputKembali');
const resultActions = document.getElementById('resultActions');
const resultClose   = document.getElementById('resultClose');

if (btnInputKembali) btnInputKembali.addEventListener('click', ()=>{
  resultPop?.classList.remove('show');
  // reset input dasar
  ['buktiBon','buktiSJ','buktiUmum'].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  [tanggal, uraian, nominal].forEach(el=>{ if(el) el.value=''; });
  // reset material item
  if (itemsWrap) itemsWrap.innerHTML = '';
  if (fakturTotalEl) fakturTotalEl.textContent = 'Rp 0';
  if (noFaktur) noFaktur.value = '';
  if (kreditor){ kreditor.value = 'CV Alam Berkah Abadi'; }
  if (kreditorLain){ kreditorLain.value = ''; kreditorLain.classList.add('hidden'); }
  if (statusSel){ statusSel.value = 'Sudah Dibayar'; }
  go(1);
});

function exitApp(){
  window.open('', '_self'); window.close();
  setTimeout(()=>{ if (document.visibilityState !== 'hidden'){ location.replace(EXIT_FALLBACK_URL); } }, 80);
}
function showLoading(on=true){ if (loadingPop) loadingPop.classList.toggle('show', on); }
function setErrorCloseOnly(){
  if (!resultActions || !resultClose) return;
  resultActions.style.display = 'none';
  resultClose.classList.remove('hidden');
  resultClose.onclick = ()=> resultPop?.classList.remove('show');
}
function setSuccessActions(){
  if (!resultActions || !resultClose || !btnKeluar) return;
  resultActions.style.display = '';
  resultClose.classList.add('hidden');
  btnKeluar.onclick = exitApp;
}
function showResult(type='success', title='Selesai', message='Data anda telah terinput.', opts={}){
  if (!resultPop || !resultIcon || !resultTitle || !resultMsg) return;
  if (type==='success'){
    resultIcon.innerHTML = `
      <div class="icon-wrap success" aria-hidden="true">
        <svg viewBox="0 0 52 52"><path class="stroke" d="M14 27 l8 8 l16 -18"/></svg>
      </div>`;
    setSuccessActions();
  } else {
    resultIcon.innerHTML = `
      <div class="icon-wrap error" aria-hidden="true">
        <svg viewBox="0 0 52 52">
          <path class="stroke" d="M16 16 L36 36"/>
          <path class="stroke" d="M36 16 L16 36"/>
        </svg>
      </div>`;
    setErrorCloseOnly();
  }
  resultTitle.textContent = title;
  resultMsg.textContent   = message;
  const backBtn = document.getElementById('btnInputKembali');
  if (backBtn) backBtn.style.display = (type==='success' && !opts.onlyDismiss) ? '' : 'none';
  resultPop.classList.add('show');
}

/***** ==================== PICKER (DROPDOWN MODAL) ==================== *****/
const pickerPop   = document.getElementById('pickerPop');
const pickerTitle = document.getElementById('pickerTitle');
const pickerList  = document.getElementById('pickerList');
const pickerCancel= document.getElementById('pickerCancel');

if (pickerCancel) pickerCancel.addEventListener('click', ()=> pickerPop?.classList.remove('show'));

function openPicker(selectEl, btn){
  if (!pickerPop || !pickerTitle || !pickerList) return;
  const label = btn.parentElement?.querySelector('label')?.textContent || 'Pilih Opsi';
  pickerTitle.textContent = label;
  pickerList.innerHTML = '';
  [...selectEl.options].forEach((opt, idx)=>{
    const div = document.createElement('div');
    div.className = 'picker-option' + (opt.selected ? ' selected':'') + (opt.disabled ? ' disabled':'');
    div.textContent = opt.text;
    if (!opt.disabled){
      div.addEventListener('click', ()=>{
        selectEl.selectedIndex = idx;
        btn.textContent = opt.text;
        selectEl.dispatchEvent(new Event('change',{bubbles:true}));
        pickerPop.classList.remove('show');
      }, {passive:true});
    }
    pickerList.appendChild(div);
  });
  pickerPop.classList.add('show');
}

function initNiceSelects(){
  document.querySelectorAll('select[data-nice]').forEach((sel)=>{
    if (sel.dataset.enhanced) return;
    sel.dataset.enhanced = "1";

    sel.classList.add('native-hidden');
    const wrap = document.createElement('div');
    wrap.className = 'nice-wrap';
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nice-select';
    btn.setAttribute('aria-haspopup','dialog');
    btn.textContent = sel.options[sel.selectedIndex]?.text || '';
    wrap.appendChild(btn);

    const open = (e)=>{ e.preventDefault(); openPicker(sel, btn); };
    btn.addEventListener('click', open);
    btn.addEventListener('touchstart', open, {passive:false});
  });
}
document.addEventListener('DOMContentLoaded', initNiceSelects);

/***** ==================== KIRIM DATA KE GAS ==================== *****/
function quickPop(message){
  showResult('error','Terjadi Kesalahan', message || 'Periksa kembali input anda.', {onlyDismiss:true});
  return false;
}

// Kompres adaptif untuk gambar >1MB (target ~900KB)
async function compressIfNeeded(file){
  if (!file || !(file.type||'').startsWith('image/')) return file;
  if (file.size <= ONE_MB) return file;

  const img = await fileToImage(file);
  // Tentukan skala kira-kira (turunkan resolusi jika perlu)
  const scale = Math.min(1, Math.sqrt((ONE_MB * 0.9) / file.size));
  const canvas = document.createElement('canvas');
  canvas.width  = Math.max(480, Math.round(img.width  * scale));
  canvas.height = Math.max(480, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  let quality = 0.82;
  let blob = await new Promise(res=> canvas.toBlob(res, 'image/jpeg', quality));
  // jika tetap di atas 1MB, turunkan quality bertahap (min 0.5)
  while (blob && blob.size > ONE_MB && quality > 0.5){
    quality -= 0.08;
    // eslint-disable-next-line no-await-in-loop
    blob = await new Promise(res=> canvas.toBlob(res, 'image/jpeg', quality));
  }
  // fallback: kalau somehow gagal, kembali ke file asli
  if (!blob) return file;
  return new File([blob], (file.name || 'image') + '.jpg', {type: 'image/jpeg'});
}

function fileToImage(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>{
      const img = new Image();
      img.onload = ()=> resolve(img);
      img.onerror= reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function filesToPayloadArrays(){
  const isMat = (kategoriAwalSel?.value==='Material' && jenisSel?.value==='Pengeluaran');

  const out = { buktiInvoice:[], buktiSuratJalan:[], buktiLain:[], deferredFiles:[] };

  async function pushList(inputId, targetArr){
    const list = document.getElementById(inputId)?.files || [];
    for (const f of list){
      // compress adaptif jika >1MB
      let file = f;
      if ((f.type||'').startsWith('image/') && f.size > ONE_MB){
        // eslint-disable-next-line no-await-in-loop
        file = await compressIfNeeded(f);
      }
      if ((file.size||0) > ONE_MB){
        // tetap besar: antrekan saja
        out.deferredFiles.push({ name:file.name, type:file.type, size:file.size, bucket: inputId });
      }else{
        // bawa langsung sebagai base64
        // eslint-disable-next-line no-await-in-loop
        const base64 = await fileToBase64(file);
        targetArr.push({ name:file.name, type:file.type, base64 });
      }
    }
  }

  if (isMat){
    await pushList('buktiBon', out.buktiInvoice);
    await pushList('buktiSJ',  out.buktiSuratJalan);
  } else {
    await pushList('buktiUmum', out.buktiLain);
  }
  return out;
}

function fileToBase64(file){
  return new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onloadend = ()=> resolve((fr.result||'').toString().split(',')[1] || '');
    fr.onerror   = reject;
    fr.readAsDataURL(file);
  });
}

function buildPayload(){
  const isMat = (kategoriAwalSel?.value==='Material' && jenisSel?.value==='Pengeluaran');
  const kreditorFinal = (kreditor?.value === '__OTHER__') ? (kreditorLain?.value||'').trim() : (kreditor?.value || '');

  const payload = {
    action: isMat ? 'submitMaterialLine' : 'submitGeneral',
    penginput: penginputSel?.value || '',
    jenis: jenisSel?.value || '',
    kategori: kategoriAwalSel?.value || '',
    tanggal: tanggal?.value || '',
    proyek:  proyek?.value || '',
    uraian:  isMat ? '' : (uraian?.value || ''),
    // nominal di-hide pada material; server pakai total faktur dari items
    nominal: (nominal?.value || '').replace(/[^\d]/g,''),
    kreditor: kreditorFinal,
    status: statusSel?.value || '',
    noFaktur: isMat ? (noFaktur?.value || '') : '',

    // material detail
    items: isMat ? getAllItems() : null,

    // lampiran
    buktiInvoice:[], buktiSuratJalan:[], buktiLain:[],
    deferredFiles:[],
  };
  return payload;
}

async function sendData(){
  previewModal?.classList.remove('active');

  try{
    showLoading(true);
    const payload = buildPayload();
    const files = await filesToPayloadArrays();
    payload.buktiInvoice  = files.buktiInvoice;
    payload.buktiSuratJalan = files.buktiSuratJalan;
    payload.buktiLain     = files.buktiLain;
    payload.deferredFiles = files.deferredFiles;

    // kirim
    const controller = new AbortController();
    const t = setTimeout(()=>controller.abort(), 25000);
    const resp = await fetch(scriptURL, {
      method:'POST',
      headers:{ 'Content-Type':'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload),
      signal: controller.signal
    }).finally(()=>clearTimeout(t));

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    showLoading(false);

    if (data.status === 'ok'){
      // sinkron nomor faktur terpakai (opsional tergantung backend)
      showResult('success','Selesai','Data anda telah terinput.');
    } else {
      showResult('error','Terjadi Kesalahan', data.error || 'Gagal menyimpan.');
    }
  }catch(err){
    showLoading(false);
    const msg = (err.name === 'AbortError')
      ? 'Koneksi lambat. Coba lagi (maks 25 dtk).'
      : (String(err).includes('Failed to fetch') ? 'Gagal terhubung ke server.' : err.message);
    showResult('error','Terjadi Kesalahan', msg);
    console.error(err);
  }
}

/***** ==================== INIT SEMUANYA ==================== *****/
document.addEventListener('DOMContentLoaded', ()=>{
  // default ke step/home sesuai elemen
  if (home) go(0); else if (step1) go(1);

  // Siapkan picker untuk semua select
  initNiceSelects();

  // Pastikan material mode tersetel benar jika user ubah dropdown awal
  toggleMaterialBlock();
});
