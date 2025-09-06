// URL Web App GAS (sudah /exec)
const scriptURL = 'https://script.google.com/macros/s/AKfycbyAOVy2t6K03MoMreSP82OuXGUa_NbiA4JlTp3Sq2rm-KlKb1QLIOP7TyBy98raAAj2Pg/exec';

// ====== Elemen langkah ======
const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const step3 = document.getElementById('step3');

// Step1 controls
const penginputSel = document.getElementById('penginput');
const jenisSel = document.getElementById('jenis');
const kategoriAwalSel = document.getElementById('kategoriAwal');
document.getElementById('toStep2').addEventListener('click', () => { go(2); });

// Step2 controls
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
  if (!tanggal.value){ showToast('Isi Tanggal.', 'error'); return; }
  if (!proyek.value){ showToast('Pilih Proyek.', 'error'); return; }
  if (!uraian.value){ showToast('Isi Uraian.', 'error'); return; }
  if (!nominal.value){ showToast('Isi Nominal.', 'error'); return; }
  if (!statusSel.value){ showToast('Pilih Status.', 'error'); return; }
  prepareUploadSection(); go(3);
});

// Kreditor: opsi "Lainnya"
kreditor.addEventListener('change', ()=>{
  if (kreditor.value === '__OTHER__'){ kreditorLain.classList.remove('hidden'); kreditorLain.focus(); }
  else { kreditorLain.classList.add('hidden'); kreditorLain.value=''; }
});

// Rupiah formatter
const toIDR = v => (v||'').toString().replace(/[^\d]/g,'').replace(/\B(?=(\d{3})+(?!\d))/g,'.');
nominal.addEventListener('input', ()=>{ nominal.value = toIDR(nominal.value); });

// Step3 controls (upload)
const wrapBon = document.getElementById('wrapBon');
const wrapSJ  = document.getElementById('wrapSJ');
const wrapUmum= document.getElementById('wrapBuktiUmum');

document.getElementById('backTo2').addEventListener('click',(e)=>{e.preventDefault(); go(2);});
document.getElementById('openPreview').addEventListener('click', openPreview);

// ===== Modal & Preview (2-step) =====
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

// State global
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

/* ======== Toast util (tema terang) ======== */
function showToast(message, type='success', duration=3000){
  const wrap = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type==='error' ? 'toast-error':'toast-success'}`;
  el.innerHTML = `<span>${message}</span><button class="close" aria-label="Close">&times;</button>`;
  wrap.appendChild(el);
  const close = ()=> { el.style.opacity='0'; setTimeout(()=>el.remove(), 160); };
  el.querySelector('.close').onclick = close;
  setTimeout(close, duration);
}

/* ======== Validasi file ======== */
const MAX_MB = 5;
const ALLOWED = ['image/', 'application/pdf'];
function validateFileList(fileList, label){
  const files = [...(fileList||[])];
  for (const f of files){
    const okType = ALLOWED.some(p => f.type.startsWith(p));
    const okSize = f.size <= MAX_MB * 1024 * 1024;
    if (!okType){ showToast(`${label}: ${f.name} bertipe tidak didukung.`, 'error'); return false; }
    if (!okSize){ showToast(`${label}: ${f.name} > ${MAX_MB}MB.`, 'error'); return false; }
  }
  return true;
}

/* ======== Preview ======== */
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
  if (kreditor.value==='__OTHER__' && !kreditorFinal){ showToast('Isi Kreditor/Supplier.', 'error'); kreditorLain.focus(); return; }

  // Validasi file
  const isMatPeng = (STATE.kategori==='Material' && STATE.jenis==='Pengeluaran');
  let ok = true;
  if (isMatPeng){
    ok = validateFileList(document.getElementById('buktiBon').files, 'Bukti Bon') &&
         validateFileList(document.getElementById('buktiSJ').files, 'Bukti Surat Jalan');
  } else {
    ok = validateFileList(document.getElementById('buktiUmum').files, 'Bukti Transaksi');
  }
  if (!ok) return;

  // Tampil data (Step 1)
  setText('pv-penginput', STATE.penginput);
  setText('pv-jenis', STATE.jenis);
  setText('pv-kategori', STATE.kategori);
  setText('pv-tanggal', tanggal.value);
  setText('pv-proyek', proyek.value);
  setText('pv-uraian', uraian.value);
  setText('pv-nominal', nominal.value ? 'Rp '+nominal.value : '');
  setText('pv-kreditor', kreditorFinal || '-');
  setText('pv-status', statusSel.value);

  // Thumbs (Step 2) — hemat memori: ObjectURL + batasi 8
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

  // buka modal pada step 1
  showPv(1);
  previewModal.classList.add('active');
}

/* ======== Kirim ke GAS ======== */
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
    buktiInvoice: [],
    buktiSuratJalan: [],
    buktiLain: []
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

  Promise.all(readers)
    .then(()=>{
      // timeout & simple request (hindari preflight)
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
      if (data.status==='ok'){
        showToast('Tersimpan. ID: ' + data.id, 'success', 4000);
        // reset minimal
        ['buktiBon','buktiSJ','buktiUmum'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
        [tanggal,uraian,nominal].forEach(el=>el.value='');
        kreditor.value='Toko Bangunan A'; kreditorLain.value=''; kreditorLain.classList.add('hidden');
        statusSel.value='Sudah Dibayar';

        // auto-return ke Landing 1
        step3.classList.add('hidden'); step2.classList.add('hidden'); step1.classList.remove('hidden');
      } else {
        throw new Error(data.error || 'Gagal simpan');
      }
    })
    .catch(err=>{
      const msg = (err.name === 'AbortError')
        ? 'Koneksi lambat. Coba lagi (maks 25 dtk).'
        : (String(err).includes('Failed to fetch') ? 'Gagal terhubung ke server.' : err.message);
      showToast('Terjadi kesalahan: ' + msg, 'error');
      console.error(err);
    });
}
