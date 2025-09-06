// URL Web App GAS
const scriptURL = 'https://script.google.com/macros/s/AKfycbyAOVy2t6K03MoMreSP82OuXGUa_NbiA4JlTp3Sq2rm-KlKb1QLIOP7TyBy98raAAj2Pg/exec';

// Elemen langkah
const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const step3 = document.getElementById('step3');

// Step1 controls
const penginputSel = document.getElementById('penginput');
const jenisSel = document.getElementById('jenis');
const kategoriAwalSel = document.getElementById('kategoriAwal');
document.getElementById('toStep2').addEventListener('click', () => {
  if (!penginputSel.value) return alert('Pilih Penginput.');
  if (!jenisSel.value) return alert('Pilih Jenis Transaksi.');
  if (!kategoriAwalSel.value) return alert('Pilih Kategori.');
  go(2);
});

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
  if (!tanggal.value) return alert('Isi Tanggal.');
  if (!proyek.value) return alert('Pilih Proyek.');
  if (!uraian.value) return alert('Isi Uraian.');
  if (!nominal.value) return alert('Isi Nominal.');
  if (!statusSel.value) return alert('Pilih Status.');
  prepareUploadSection(); // atur input upload sesuai kondisi
  go(3);
});

// Kreditor: opsi "Lainnya"
kreditor.addEventListener('change', ()=>{
  if (kreditor.value === '__OTHER__'){ kreditorLain.classList.remove('hidden'); kreditorLain.focus(); }
  else { kreditorLain.classList.add('hidden'); kreditorLain.value=''; }
});

// Rupiah
const toIDR = v => (v||'').toString().replace(/[^\d]/g,'').replace(/\B(?=(\d{3})+(?!\d))/g,'.');
nominal.addEventListener('input', ()=>{ nominal.value = toIDR(nominal.value); });

// Step3 controls (upload)
const wrapBon = document.getElementById('wrapBon');
const wrapSJ  = document.getElementById('wrapSJ');
const wrapUmum= document.getElementById('wrapBuktiUmum');
document.getElementById('backTo2').addEventListener('click',(e)=>{e.preventDefault(); go(2);});

// Tombol Kirim → preview modal
document.getElementById('openPreview').addEventListener('click', openPreview);

// Modal
const previewModal = document.getElementById('previewModal');
const cancelBtn = document.getElementById('cancel-btn');
const confirmBtn = document.getElementById('confirm-btn');
cancelBtn.addEventListener('click', ()=> previewModal.classList.remove('active'));
confirmBtn.addEventListener('click', sendData);

// State global
const STATE = { penginput:'', jenis:'', kategori:'', };

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

// ===== Preview =====
function openPreview(){
  const kreditorFinal = (kreditor.value==='__OTHER__') ? (kreditorLain.value||'').trim() : kreditor.value;
  if (kreditor.value==='__OTHER__' && !kreditorFinal){ alert('Isi Kreditor/Supplier.'); kreditorLain.focus(); return; }

  // tampilkan data
  setText('pv-penginput', STATE.penginput);
  setText('pv-jenis', STATE.jenis);
  setText('pv-kategori', STATE.kategori);
  setText('pv-tanggal', tanggal.value);
  setText('pv-proyek', proyek.value);
  setText('pv-uraian', uraian.value);
  setText('pv-nominal', nominal.value ? 'Rp '+nominal.value : '');
  setText('pv-kreditor', kreditorFinal || '-');
  setText('pv-status', statusSel.value);

  // thumbnails
  const thumbs = document.getElementById('pv-thumbs'); thumbs.innerHTML='';
  let count = 0;
  const files = gatherFilesForPreview();
  if (!files.length){
    document.getElementById('pv-bukti-kosong').style.display='block';
  } else {
    document.getElementById('pv-bukti-kosong').style.display='none';
    files.forEach(f=>{
      const box = document.createElement('div'); box.className='thumb';
      if (f.type.toLowerCase().startsWith('image/')){
        const img=document.createElement('img'); const fr=new FileReader();
        fr.onload = ev=> img.src=ev.target.result; fr.readAsDataURL(f);
        box.appendChild(img);
      } else if (f.type==='application/pdf'){ box.classList.add('pdf'); }
      else { box.textContent=f.name; }
      thumbs.appendChild(box); count++;
    });
  }
  previewModal.classList.add('active');
}
function setText(id,v){ document.getElementById(id).textContent = v || '-'; }

function gatherFilesForPreview(){
  const isMatPeng = (STATE.kategori==='Material' && STATE.jenis==='Pengeluaran');
  if (isMatPeng){
    return [...(document.getElementById('buktiBon').files||[]), ...(document.getElementById('buktiSJ').files||[])];
  } else {
    return [...(document.getElementById('buktiUmum').files||[])];
  }
}

// ===== Kirim =====
function sendData(){
  previewModal.classList.remove('active');

  const kreditorFinal = (kreditor.value==='__OTHER__') ? (kreditorLain.value||'').trim() : kreditor.value;

  const payload = {
    penginput: STATE.penginput,
    jenis: STATE.jenis,
    kategori: STATE.kategori,
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

  const isMatPeng = (STATE.kategori==='Material' && STATE.jenis==='Pengeluaran');
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

  Promise.all(readers).then(()=>{
    return fetch(scriptURL, { method:'POST', body: JSON.stringify(payload) });
  }).then(r=>r.json()).then(data=>{
    if (data.status==='ok'){
      alert('Tersimpan. ID: '+data.id);
      // reset minimal
      if (document.getElementById('buktiBon')) document.getElementById('buktiBon').value='';
      if (document.getElementById('buktiSJ')) document.getElementById('buktiSJ').value='';
      if (document.getElementById('buktiUmum')) document.getElementById('buktiUmum').value='';
      // balik ke awal?
      // step3.classList.add('hidden'); step1.classList.remove('hidden');
    } else {
      throw new Error(data.error || 'Gagal simpan.');
    }
  }).catch(err=>{
    console.error(err); alert('Terjadi kesalahan: '+err.message);
  });
}
