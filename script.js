// URL Web App GAS (deployment: Anyone with the link)
const scriptURL = 'https://script.google.com/macros/s/AKfycby5M6p9T7uo51PCCatCbVGa14yyqFlyD5YrIt1Zj0eeGcY6XJj5k-IWFb6Qu7VtxhCHaw/exec';

/* ====== Elemen langkah ====== */
const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const step3 = document.getElementById('step3');

/* Step1 */
const penginputSel = document.getElementById('penginput');
const jenisSel = document.getElementById('jenis');
const kategoriAwalSel = document.getElementById('kategoriAwal');
document.getElementById('toStep2').addEventListener('click', () => { go(2); });

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
  if (!tanggal.value) return quickPop('Isi Tanggal.', 'error');
  if (!proyek.value)  return quickPop('Pilih Proyek.', 'error');
  if (!uraian.value)  return quickPop('Isi Uraian.', 'error');
  if (!nominal.value) return quickPop('Isi Nominal.', 'error');
  if (!statusSel.value) return quickPop('Pilih Status.', 'error');
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

/* Step3 (upload) */
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

/* ===== Pop mini (untuk validasi singkat) ===== */
function quickPop(message, type='error'){
  showResult('error', 'Validasi Gagal', message, {onlyDismiss:true});
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

btnKeluar.addEventListener('click', ()=> resultPop.classList.remove('show'));
btnInputKembali.addEventListener('click', ()=>{
  resultPop.classList.remove('show');
  // reset & kembali ke step1
  ['buktiBon','buktiSJ','buktiUmum'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  [tanggal,uraian,nominal].forEach(el=>el.value='');
  kreditor.value='Toko Bangunan A'; kreditorLain.value=''; kreditorLain.classList.add('hidden');
  statusSel.value='Sudah Dibayar';
  step3.classList.add('hidden'); step2.classList.add('hidden'); step1.classList.remove('hidden');
  window.scrollTo({top:0,behavior:'smooth'});
});

function showLoading(on=true){ loadingPop.classList.toggle('show', on); }

function showResult(type='success', title='Selesai', message='Data anda telah terinput.', opts={}){
  // icon animasi
  if (type==='success'){
    resultIcon.innerHTML =
      `<div class="icon-wrap success" aria-hidden="true">
        <svg viewBox="0 0 52 52"><path class="stroke" d="M14 27 l8 8 l16 -18"/></svg>
      </div>`;
  } else {
    resultIcon.innerHTML =
      `<div class="icon-wrap error" aria-hidden="true">
        <svg viewBox="0 0 52 52">
          <path class="stroke" d="M16 16 L36 36"/>
          <path class="stroke" d="M36 16 L16 36"/>
        </svg>
      </div>`;
  }
  resultTitle.textContent = title || (type==='success' ? 'Selesai' : 'Terjadi Kesalahan');
  resultMsg.textContent   = message || (type==='success' ? 'Data anda telah terinput.' : 'Silakan coba lagi.');
  // opsi: hanya tombol keluar (untuk validasi cepat)
  const onlyDismiss = !!opts.onlyDismiss;
  btnInputKembali.style.display = onlyDismiss ? 'none' : '';
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
        headers:{ 'Content-Type':'text/plain;charset=UTF-8' }, // simple request
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

/* ===== Custom dropdown (NiceSelect minimal) ===== */
function initNiceSelects(){
  document.querySelectorAll('select[data-nice]').forEach((sel)=>{
    if (sel.dataset.enhanced) return;
    sel.dataset.enhanced = "1";

    const wrap = document.createElement('div');
    wrap.className = 'nice-wrap';
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nice-select';
    btn.setAttribute('aria-haspopup','listbox');
    btn.textContent = sel.options[sel.selectedIndex]?.text || '';
    wrap.appendChild(btn);

    const list = document.createElement('div');
    list.className = 'nice-list';
    list.setAttribute('role','listbox');
    wrap.appendChild(list);

    function rebuild(){
      list.innerHTML = '';
      [...sel.options].forEach((opt, idx)=>{
        const item = document.createElement('div');
        item.className = 'nice-option' + (opt.disabled ? ' disabled':'') + (opt.selected ? ' selected':'');
        item.setAttribute('role','option');
        item.dataset.value = opt.value;
        item.textContent = opt.text;
        if (!opt.disabled){
          item.addEventListener('click', ()=>{
            sel.selectedIndex = idx;
            btn.textContent = opt.text;
            list.querySelectorAll('.nice-option').forEach(o=>o.classList.remove('selected'));
            item.classList.add('selected');
            sel.dispatchEvent(new Event('change',{bubbles:true}));
            wrap.classList.remove('open');
          });
        }
        list.appendChild(item);
      });
    }
    rebuild();

    btn.addEventListener('click', ()=>{
      const opened = document.querySelector('.nice-wrap.open');
      if (opened && opened!==wrap) opened.classList.remove('open');
      wrap.classList.toggle('open');
    });
    document.addEventListener('click', (e)=>{ if(!wrap.contains(e.target)) wrap.classList.remove('open'); });
    window.addEventListener('scroll', ()=> wrap.classList.remove('open'), {passive:true});

    sel.addEventListener('change', ()=>{
      btn.textContent = sel.options[sel.selectedIndex]?.text || '';
      rebuild();
    });

    // hide select asli
    sel.style.position='absolute'; sel.style.opacity='0'; sel.style.pointerEvents='none'; sel.style.width='0'; sel.style.height='0';
  });
}
document.addEventListener('DOMContentLoaded', initNiceSelects);
