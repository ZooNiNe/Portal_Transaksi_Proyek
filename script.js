// GAS Web App URL
const scriptURL = 'https://script.google.com/macros/s/AKfycby5M6p9T7uo51PCCatCbVGa14yyqFlyD5YrIt1Zj0eeGcY6XJj5k-IWFb6Qu7VtxhCHaw/exec';
const EXIT_FALLBACK_URL = 'about:blank';

/* ===== Elemen langkah ===== */
const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const step3 = document.getElementById('step3');

/* Step1 */
const penginputSel = document.getElementById('penginput');
const jenisSel = document.getElementById('jenis');
const kategoriAwalSel = document.getElementById('kategoriAwal');

const goto2 = (e)=>{ e && e.preventDefault && e.preventDefault(); go(2); };
document.getElementById('toStep2').addEventListener('click', goto2);
document.getElementById('toStep2').addEventListener('touchend', goto2, {passive:false});

/* Step2 */
const tanggal = document.getElementById('tanggal');
const proyek = document.getElementById('proyek');
const uraian = document.getElementById('uraian');
const nominal = document.getElementById('nominal');
const kreditor = document.getElementById('kreditor');
const kreditorLain = document.getElementById('kreditorLain');
const statusSel = document.getElementById('status');

document.getElementById('backTo1').addEventListener('click', (e)=>{e.preventDefault(); go(1);});
document.getElementById('toStep3').addEventListener('click', (e)=>{
  e.preventDefault();
  if (!tanggal.value) return quickPop('Isi Tanggal.');
  if (!proyek.value)  return quickPop('Pilih Proyek.');
  if (!uraian.value)  return quickPop('Isi Uraian.');
  if (!nominal.value) return quickPop('Isi Nominal.');
  if (!statusSel.value) return quickPop('Pilih Status.');
  prepareUploadSection(); go(3);
});

/* Kreditor "Lainnya" */
kreditor.addEventListener('change', ()=>{
  if (kreditor.value === '__OTHER__'){ kreditorLain.classList.remove('hidden'); kreditorLain.focus(); }
  else { kreditorLain.classList.add('hidden'); kreditorLain.value=''; }
});

/* Format Rupiah */
const toIDR = v => (v||'').toString().replace(/[^\d]/g,'').replace(/\B(?=(\d{3})+(?!\d))/g,'.');
nominal.addEventListener('input', ()=>{ nominal.value = toIDR(nominal.value); });

/* Step3 */
const wrapBon = document.getElementById('wrapBon');
const wrapSJ  = document.getElementById('wrapSJ');
const wrapUmum= document.getElementById('wrapBuktiUmum');
document.getElementById('backTo2').addEventListener('click',(e)=>{e.preventDefault(); go(2);});
document.getElementById('openPreview').addEventListener('click', openPreview);

/* Modal Preview */
const previewModal = document.getElementById('previewModal');
const cancelBtn = document.getElementById('cancel-btn');
const confirmBtn = document.getElementById('confirm-btn');
cancelBtn.addEventListener('click', ()=> previewModal.classList.remove('active'));
confirmBtn.addEventListener('click', sendData);

const pvStep1 = document.getElementById('pvStep1');
const pvStep2 = document.getElementById('pvStep2');
const pvTab1  = document.getElementById('pvTab1');
const pvTab2  = document.getElementById('pvTab2');
const pvBack  = document.getElementById('pvBack');
const pvNext  = document.getElementById('pvNext');

pvTab1.addEventListener('click',()=>showPv(1));
pvTab2.addEventListener('click',()=>showPv(2));
pvBack.addEventListener('click',()=>showPv(1));
pvNext.addEventListener('click',()=>showPv(2));

function showPv(n){
  const isOne = (n===1);
  pvStep1.classList.toggle('active', isOne);
  pvStep2.classList.toggle('active', !isOne);
  pvTab1.classList.toggle('active', isOne);
  pvTab2.classList.toggle('active', !isOne);
  pvBack.classList.toggle('hidden', isOne);
  pvNext.classList.toggle('hidden', !isOne);
}

/* State */
const STATE = { penginput:'', jenis:'', kategori:'' };

function go(n){
  step1.classList.toggle('hidden', n!==1);
  step2.classList.toggle('hidden', n!==2);
  step3.classList.toggle('hidden', n!==3);
  if (n===2){
    STATE.penginput = penginputSel.value;
    STATE.jenis = jenisSel.value;
    STATE.kategori = kategoriAwalSel.value;
  }
}

function prepareUploadSection(){
  const isMaterialPengeluaran = (STATE.kategori==='Material' && STATE.jenis==='Pengeluaran');
  wrapBon.classList.toggle('hidden', !isMaterialPengeluaran);
  wrapSJ.classList.toggle('hidden', !isMaterialPengeluaran);
  wrapUmum.classList.toggle('hidden', isMaterialPengeluaran);
}

/* ===== Result pop (juga untuk validasi) ===== */
function quickPop(message){
  showResult('error','Terjadi Kesalahan', message || 'Periksa kembali input anda.', {onlyDismiss:true});
  return false;
}

/* ===== Validasi file ===== */
const MAX_MB = 5;
const ALLOWED = ['image/', 'application/pdf'];
function validateFileList(fileList, label){
  const files = [...(fileList||[])];
  for (const f of files){
    const okType = ALLOWED.some(p => f.type.startsWith(p));
    const okSize = f.size <= MAX_MB * 1024 * 1024;
    if (!okType){ return quickPop(`${label}: ${f.name} bertipe tidak didukung.`); }
    if (!okSize){ return quickPop(`${label}: ${f.name} > ${MAX_MB}MB.`); }
  }
  return true;
}

/* ===== Preview ===== */
function setText(id,v){ document.getElementById(id).textContent = v || '-'; }

function filesForPreview(){
  const isMatPeng = (STATE.kategori==='Material' && STATE.jenis==='Pengeluaran');
  if (isMatPeng){
    return [...(document.getElementById('buktiBon').files||[]), ...(document.getElementById('buktiSJ').files||[])];
  } else {
    return [...(document.getElementById('buktiUmum').files||[])];
  }
}

function openPreview(){
  const kreditorFinal = (kreditor.value==='__OTHER__') ? (kreditorLain.value||'').trim() : kreditor.value;
  if (kreditor.value==='__OTHER__' && !kreditorFinal){ return quickPop('Isi Kreditor/Supplier.'); }

  const isMatPeng = (STATE.kategori==='Material' && STATE.jenis==='Pengeluaran');
  let ok = true;
  if (isMatPeng){
    ok = validateFileList(document.getElementById('buktiBon').files, 'Bukti Bon') &&
         validateFileList(document.getElementById('buktiSJ').files, 'Bukti Surat Jalan');
  } else {
    ok = validateFileList(document.getElementById('buktiUmum').files, 'Bukti Transaksi');
  }
  if (!ok) return;

  setText('pv-penginput', STATE.penginput);
  setText('pv-jenis', STATE.jenis);
  setText('pv-kategori', STATE.kategori);
  setText('pv-tanggal', tanggal.value);
  setText('pv-proyek', proyek.value);
  setText('pv-uraian', uraian.value);
  setText('pv-nominal', nominal.value ? 'Rp '+nominal.value : '');
  setText('pv-kreditor', kreditorFinal || '-');
  setText('pv-status', statusSel.value);

  const thumbs = document.getElementById('pv-thumbs'); thumbs.innerHTML='';
  const files = filesForPreview().slice(0,8);
  if (!files.length){
    document.getElementById('pv-bukti-kosong').style.display='block';
  } else {
    document.getElementById('pv-bukti-kosong').style.display='none';
    files.forEach(f=>{
      const box = document.createElement('div'); box.className='thumb';
      if ((f.type||'').toLowerCase().startsWith('image/')){
        const img=document.createElement('img');
        const url = URL.createObjectURL(f);
        img.onload = ()=> URL.revokeObjectURL(url);
        img.src = url;
        box.appendChild(img);
      } else if (f.type==='application/pdf'){ box.classList.add('pdf'); }
      else { box.textContent=f.name; }
      thumbs.appendChild(box);
    });
  }

  showPv(1);
  previewModal.classList.add('active');
}

/* ===== Loading & Result Popups ===== */
const loadingPop = document.getElementById('loadingPop');
const resultPop  = document.getElementById('resultPop');
const resultIcon = document.getElementById('resultIcon');
const resultTitle= document.getElementById('resultTitle');
const resultMsg  = document.getElementById('resultMsg');
const btnKeluar  = document.getElementById('btnKeluar');
const btnInputKembali = document.getElementById('btnInputKembali');
const resultActions = document.getElementById('resultActions');
const resultClose = document.getElementById('resultClose');

btnInputKembali.addEventListener('click', ()=>{
  resultPop.classList.remove('show');
  // reset & kembali ke step1
  ['buktiBon','buktiSJ','buktiUmum'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  [tanggal,uraian,nominal].forEach(el=>el.value='');
  kreditor.value='CV Alam Berkah Abadi'; kreditorLain.value=''; kreditorLain.classList.add('hidden');
  statusSel.value='Sudah Dibayar';
  step3.classList.add('hidden'); step2.classList.add('hidden'); step1.classList.remove('hidden');
  window.scrollTo({top:0,behavior:'smooth'});
});

/* ======== EXIT: tutup tab robust di mobile ======== */
function exitApp(){
  // 1) coba tutup standar
  try{ window.open('', '_self'); }catch(e){}
  try{ window.close(); }catch(e){}

  // 2) bekukan UI agar tidak "kembali ke landing 1"
  try{
    document.body.style.background = '#fff';
    document.body.innerHTML = '';
  }catch(e){}

  // 3) fallback bertingkat — beberapa mobile butuh ini
  const attempts = [
    ()=>location.replace(EXIT_FALLBACK_URL),
    ()=>location.replace('data:text/html,<meta name=viewport content=width=device-width,initial-scale=1><style>body{font-family:sans-serif;padding:24px;color:#6b7280}</style><p>Tab ditutup.</p>'),
    ()=>{ location.href = EXIT_FALLBACK_URL; }
  ];
  let i = 0;
  (function tryClose(){
    if (document.visibilityState === 'hidden') return; // tab sudah hilang
    if (i < attempts.length){
      setTimeout(()=>{ try{ attempts[i++](); } finally{ tryClose(); } }, 80);
    }
  })();
}

/* handler sukses vs error */
function showLoading(on=true){ loadingPop.classList.toggle('show', on); }
function setErrorCloseOnly(){
  resultActions.style.display = 'none';
  resultClose.classList.remove('hidden');
  resultClose.onclick = ()=> resultPop.classList.remove('show');
}
function setSuccessActions(){
  resultActions.style.display = '';
  resultClose.classList.add('hidden');
  btnKeluar.onclick = (e)=>{ e.preventDefault(); e.stopPropagation(); exitApp(); };
}

function showResult(type='success', title='Selesai', message='Data anda telah terinput.', opts={}){
  if (type==='success'){
    resultIcon.innerHTML =
      `<div class="icon-wrap success" aria-hidden="true">
        <svg viewBox="0 0 52 52"><path class="stroke" d="M14 27 l8 8 l16 -18"/></svg>
      </div>`;
    setSuccessActions();
  } else {
    resultIcon.innerHTML =
      `<div class="icon-wrap error" aria-hidden="true">
        <svg viewBox="0 0 52 52">
          <path class="stroke" d="M16 16 L36 36"/>
          <path class="stroke" d="M36 16 L16 36"/>
        </svg>
      </div>`;
    setErrorCloseOnly();
  }
  resultTitle.textContent = title;
  resultMsg.textContent   = message;
  document.getElementById('btnInputKembali').style.display = (type==='success' && !opts.onlyDismiss) ? '' : 'none';
  resultPop.classList.add('show');
}

/* ===== Kirim ke GAS ===== */
function sendData(){
  previewModal.classList.remove('active');

  const kreditorFinal = (kreditor.value==='__OTHER__') ? (kreditorLain.value||'').trim() : kreditor.value;

  const payload = {
    penginput: penginputSel.value,
    jenis: jenisSel.value,
    kategori: kategoriAwalSel.value,
    tanggal: tanggal.value,
    proyek: proyek.value,
    uraian: uraian.value,
    nominal: nominal.value.replace(/[^\d]/g,''),
    kreditor: kreditorFinal,
    status: statusSel.value,
    buktiInvoice: [], buktiSuratJalan: [], buktiLain: []
  };

  const isMatPeng = (payload.kategori==='Material' && payload.jenis==='Pengeluaran');
  const readers = [];
  const pushFiles = (fileList, targetArr)=>{
    [...(fileList||[])].forEach(f=>{
      readers.push(new Promise(res=>{
        const fr = new FileReader();
        fr.onloadend = ()=> {
          const base64 = (fr.result||'').toString().split(',')[1] || '';
          targetArr.push({ name:f.name, type:f.type, base64 });
          res();
        };
        fr.readAsDataURL(f);
      }));
    });
  };
  if (isMatPeng){
    pushFiles(document.getElementById('buktiBon').files, payload.buktiInvoice);
    pushFiles(document.getElementById('buktiSJ').files, payload.buktiSuratJalan);
  } else {
    pushFiles(document.getElementById('buktiUmum').files, payload.buktiLain);
  }

  showLoading(true);

  Promise.all(readers)
    .then(()=>{
      const controller = new AbortController();
      const t = setTimeout(()=>controller.abort(), 25000);
      return fetch(scriptURL, {
        method:'POST',
        headers:{ 'Content-Type':'text/plain;charset=UTF-8' },
        body: JSON.stringify(payload),
        signal: controller.signal
      }).finally(()=>clearTimeout(t));
    })
    .then(r=>{
      if(!r.ok) throw new Error('HTTP '+r.status);
      return r.json();
    })
    .then(data=>{
      showLoading(false);
      if (data.status==='ok'){
        showResult('success','Selesai','Data anda telah terinput.');
      } else {
        showResult('error','Terjadi Kesalahan', data.error || 'Gagal menyimpan. Coba lagi.');
      }
    })
    .catch(err=>{
      showLoading(false);
      const msg = (err.name === 'AbortError')
        ? 'Koneksi lambat. Coba lagi (maks 25 dtk).'
        : (String(err).includes('Failed to fetch') ? 'Gagal terhubung ke server.' : err.message);
      showResult('error','Terjadi Kesalahan', msg);
      console.error(err);
    });
}

/* ===== Picker modal (dropdown) ===== */
const pickerPop = document.getElementById('pickerPop');
const pickerTitle = document.getElementById('pickerTitle');
const pickerList  = document.getElementById('pickerList');
const pickerCancel= document.getElementById('pickerCancel');
pickerCancel.addEventListener('click', ()=> pickerPop.classList.remove('show'));

function openPicker(selectEl, btn){
  pickerTitle.textContent = btn.parentElement.querySelector('label')?.textContent || 'Pilih Opsi';
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

/* Enhance semua select → tombol + picker */
function initNiceSelects(){
  document.querySelectorAll('select[data-nice]').forEach((sel)=>{
    if (sel.dataset.enhanced) return;
    sel.dataset.enhanced = "1";

    // Matikan native dropdown total
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
    btn.addEventListener('touchstart', open, {passive:false}); // pastikan mobile tidak memunculkan native
  });
}
document.addEventListener('DOMContentLoaded', initNiceSelects);
