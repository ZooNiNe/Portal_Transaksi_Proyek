// ===== KONFIG =====
const scriptURL = 'https://script.google.com/macros/s/AKfycbzgod3bBBFmKBqlgyW_4oPUkCTUsaqznDV-JxPPNSac7BtTbOaMSZoBN-Y_WGaDeFj9sQ/exec';
const EXIT_FALLBACK_URL = 'about:blank';
const ONE_MB = 1024 * 1024;

// ===== SECTION refs =====
const home   = document.getElementById('home');
const step1  = document.getElementById('step1');
const step2  = document.getElementById('step2');
const step3  = document.getElementById('step3');

// ===== DASHBOARD =====
const dashCards = document.getElementById('dash-cards');
const btnRefresh = document.getElementById('btnRefresh');
const btnGotoInput = document.getElementById('gotoInput');
btnGotoInput.addEventListener('click', ()=>go(1));
btnRefresh.addEventListener('click', loadDashboard);

let chartPengeluaran;
function loadDashboard(){
  fetch(${scriptURL}?action=dashboard, {method:'GET'})
    .then(r=>r.json())
    .then(d=>{
      // cards
      const items = [
        {label:'Total Pendapatan', val:d.totalPendapatan||'-'},
        {label:'Biaya Material', val:d.totalMaterial||'-'},
        {label:'Biaya Gaji',      val:d.totalGaji||'-'},
        {label:'Kas Saat Ini',    val:d.kas||'-'},
        {label:'Estimasi Bersih', val:d.estimasi||'-'},
      ];
      dashCards.innerHTML = items.map(it=>(
        <div class="dash-card"><div class="label">${it.label}</div><div class="val">${it.val}</div></div>
      )).join('');

      // chart
      const ctx = document.getElementById('chartPengeluaran');
      if (chartPengeluaran){ chartPengeluaran.destroy(); }
      chartPengeluaran = new Chart(ctx, {
        type:'bar',
        data:{
          labels: d.chart?.labels || [],
          datasets:[{label:'Pengeluaran', data:d.chart?.values || []}]
        },
        options:{responsive:true, maintainAspectRatio:false}
      });
    })
    .catch(e=>console.error(e));
}
document.addEventListener('DOMContentLoaded', loadDashboard);

// ===== STEP 1 =====
const penginputSel = document.getElementById('penginput');
const jenisSel = document.getElementById('jenis');
const kategoriAwalSel = document.getElementById('kategoriAwal');
document.getElementById('toStep2').addEventListener('click',(e)=>{e.preventDefault(); go(2);});

// ===== STEP 2 =====
const tanggal = document.getElementById('tanggal');
const proyek = document.getElementById('proyek');
const wrapUraian = document.getElementById('wrapUraian');
const uraian = document.getElementById('uraian');
const nominal = document.getElementById('nominal');
const kreditor = document.getElementById('kreditor');
const kreditorLain = document.getElementById('kreditorLain');
const statusSel = document.getElementById('status');

// Material fields
const materialBlock = document.getElementById('materialBlock');
const noFaktur = document.getElementById('noFaktur');
const namaBarang = document.getElementById('namaBarang');
const hargaSatuan = document.getElementById('hargaSatuan');
const qty = document.getElementById('qty');
const totalHarga = document.getElementById('totalHarga');

function toIDR(v){ return (v||'').toString().replace(/[^\d]/g,'').replace(/\B(?=(\d{3})+(?!\d))/g,'.'); }
nominal.addEventListener('input', ()=> nominal.value = toIDR(nominal.value));
hargaSatuan.addEventListener('input', ()=> { hargaSatuan.value = toIDR(hargaSatuan.value); calcTotal(); });
qty.addEventListener('input', calcTotal);
function calcTotal(){
  const hs = parseInt((hargaSatuan.value||'').replace(/\./g,''))||0;
  const q  = parseInt(qty.value||0);
  const t  = hs*q;
  totalHarga.value = t ? toIDR(String(t)) : '';
}

function toggleMaterialBlock(){
  const show = (kategoriAwalSel.value==='Material' && jenisSel.value==='Pengeluaran');
  materialBlock.classList.toggle('hidden', !show);
  wrapUraian.classList.toggle('hidden', show);
}
jenisSel.addEventListener('change', toggleMaterialBlock);
kategoriAwalSel.addEventListener('change', toggleMaterialBlock);

// kreditor lainnya
kreditor.addEventListener('change', ()=>{
  if (kreditor.value==='_OTHER_'){ kreditorLain.classList.remove('hidden'); kreditorLain.focus(); }
  else { kreditorLain.classList.add('hidden'); kreditorLain.value=''; }
});

document.getElementById('backTo1').addEventListener('click', (e)=>{e.preventDefault(); go(1);});
document.getElementById('toStep3').addEventListener('click',(e)=>{
  e.preventDefault();
  if (!tanggal.value) return quickPop('Isi Tanggal.');
  if (!proyek.value)  return quickPop('Pilih Proyek.');
  const mat = !materialBlock.classList.contains('hidden');
  if (mat){
    if (!noFaktur.value) return quickPop('Isi No Faktur.');
    if (!namaBarang.value) return quickPop('Isi Nama Barang.');
    if (!hargaSatuan.value || !qty.value) return quickPop('Harga/Qty belum lengkap.');
    // isi nominal otomatis dari total
    nominal.value = totalHarga.value || nominal.value;
  }else{
    if (!uraian.value) return quickPop('Isi Uraian.');
  }
  if (!nominal.value) return quickPop('Isi Nominal.');
  if (!statusSel.value) return quickPop('Pilih Status.');
  prepareUploadSection(); go(3);
});

// ===== STEP 3 =====
const wrapBon = document.getElementById('wrapBon');
const wrapSJ  = document.getElementById('wrapSJ');
const wrapUmum= document.getElementById('wrapBuktiUmum');
document.getElementById('backTo2').addEventListener('click',(e)=>{e.preventDefault(); go(2);});
document.getElementById('openPreview').addEventListener('click', openPreview);

// ===== PREVIEW =====
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

// state + nav
const STATE = { penginput:'', jenis:'', kategori:'' };
function go(n){
  home.classList.toggle('hidden', n!==0);
  step1.classList.toggle('hidden', n!==1);
  step2.classList.toggle('hidden', n!==2);
  step3.classList.toggle('hidden', n!==3);
  if(n===1){ window.scrollTo({top:0,behavior:'smooth'}); }
  if (n===2){
    STATE.penginput = penginputSel.value;
    STATE.jenis = jenisSel.value;
    STATE.kategori = kategoriAwalSel.value;
    toggleMaterialBlock();
  }
}
function prepareUploadSection(){
  const isMaterialPengeluaran = (kategoriAwalSel.value==='Material' && jenisSel.value==='Pengeluaran');
  wrapBon.classList.toggle('hidden', !isMaterialPengeluaran);
  wrapSJ.classList.toggle('hidden', !isMaterialPengeluaran);
  wrapUmum.classList.toggle('hidden', isMaterialPengeluaran);
}
document.addEventListener('DOMContentLoaded', ()=>go(0));

// ===== helper pop
function quickPop(message){
  showResult('error','Terjadi Kesalahan', message || 'Periksa kembali input anda.', {onlyDismiss:true});
  return false;
}

// ===== file validate
const MAX_MB_EACH = 5;
const ALLOWED = ['image/', 'application/pdf'];
function validateFileList(fileList, label){
  const files = [...(fileList||[])];
  for (const f of files){
    const okType = ALLOWED.some(p => f.type.startsWith(p));
    const okSize = f.size <= MAX_MB_EACH * ONE_MB;
    if (!okType){ return quickPop(${label}: ${f.name} bertipe tidak didukung.); }
    if (!okSize){ return quickPop(${label}: ${f.name} > ${MAX_MB_EACH}MB.); }
  }
  return true;
}

// ===== preview
function setText(id,v){ document.getElementById(id).textContent = v || '-'; }
function filesForPreview(){
  const isMatPeng = (kategoriAwalSel.value==='Material' && jenisSel.value==='Pengeluaran');
  if (isMatPeng){
    return [...(document.getElementById('buktiBon').files||[]), ...(document.getElementById('buktiSJ').files||[])];
  } else {
    return [...(document.getElementById('buktiUmum').files||[])];
  }
}
function openPreview(){
  const kreditorFinal = (kreditor.value==='_OTHER_') ? (kreditorLain.value||'').trim() : kreditor.value;
  if (kreditor.value==='_OTHER_' && !kreditorFinal){ return quickPop('Isi Kreditor/Supplier.'); }
  const isMatPeng = (kategoriAwalSel.value==='Material' && jenisSel.value==='Pengeluaran');
  let ok = true;
  if (isMatPeng){
    ok = validateFileList(document.getElementById('buktiBon').files, 'Bukti Bon') &&
         validateFileList(document.getElementById('buktiSJ').files, 'Bukti Surat Jalan');
  } else {
    ok = validateFileList(document.getElementById('buktiUmum').files, 'Bukti Transaksi');
  }
  if (!ok) return;

  setText('pv-penginput', penginputSel.value);
  setText('pv-jenis', jenisSel.value);
  setText('pv-kategori', kategoriAwalSel.value);
  setText('pv-tanggal', tanggal.value);
  setText('pv-proyek', proyek.value);

  // tampilkan ringkasan material
  const showMat = (kategoriAwalSel.value==='Material' && jenisSel.value==='Pengeluaran');
  document.getElementById('pv-mat-label').style.display = showMat ? '' : 'none';
  document.getElementById('pv-mat-value').style.display = showMat ? '' : 'none';
  if(showMat){
    document.getElementById('pv-mat-value').textContent =
      ${noFaktur.value || '-'} • ${namaBarang.value || '-'} • Qty ${qty.value||0} @Rp${hargaSatuan.value||0};
  }

  if (!showMat) setText('pv-uraian', uraian.value); else setText('pv-uraian', '-');

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

// ===== Loading & Result
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
  ['buktiBon','buktiSJ','buktiUmum'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  [tanggal,uraian,nominal,noFaktur,namaBarang,hargaSatuan,qty,totalHarga].forEach(el=>{ if(el) el.value=''; });
  kreditor.value='CV Alam Berkah Abadi'; kreditorLain.value=''; kreditorLain.classList.add('hidden');
  statusSel.value='Sudah Dibayar';
  go(1);
});
function exitApp(){
  window.open('', '_self'); window.close();
  setTimeout(()=>{ if (document.visibilityState !== 'hidden'){ location.replace(EXIT_FALLBACK_URL); } }, 80);
}
function showLoading(on=true){ loadingPop.classList.toggle('show', on); }
function setErrorCloseOnly(){ resultActions.style.display='none'; resultClose.classList.remove('hidden'); resultClose.onclick=()=> resultPop.classList.remove('show'); }
function setSuccessActions(){ resultActions.style.display=''; resultClose.classList.add('hidden'); btnKeluar.onclick=exitApp; }
function showResult(type='success', title='Selesai', message='Data anda telah terinput.', opts={}){
  if (type==='success'){
    resultIcon.innerHTML = <div class="icon-wrap success"><svg viewBox="0 0 52 52"><path class="stroke" d="M14 27 l8 8 l16 -18"/></svg></div>;
    setSuccessActions();
  } else {
    resultIcon.innerHTML = <div class="icon-wrap error"><svg viewBox="0 0 52 52"><path class="stroke" d="M16 16 L36 36"/><path class="stroke" d="M36 16 L16 36"/></svg></div>;
    setErrorCloseOnly();
  }
  resultTitle.textContent = title;
  resultMsg.textContent   = message;
  document.getElementById('btnInputKembali').style.display = (type==='success' && !opts.onlyDismiss) ? '' : 'none';
  resultPop.classList.add('show');
}

// ===== Kirim ke GAS (dengan antrian >1MB) =====
function sendData(){
  previewModal.classList.remove('active');

  const kreditorFinal = (kreditor.value==='_OTHER_') ? (kreditorLain.value||'').trim() : kreditor.value;
  const isMat = (kategoriAwalSel.value==='Material' && jenisSel.value==='Pengeluaran');

  const payload = {
    action: 'submit',
    penginput: penginputSel.value,
    jenis: jenisSel.value,
    kategori: kategoriAwalSel.value,
    tanggal: tanggal.value,
    proyek: proyek.value,
    uraian: isMat ? '' : (uraian.value||''),
    nominal: (nominal.value||'').replace(/[^\d]/g,''),
    kreditor: kreditorFinal,
    status: statusSel.value,

    material: isMat ? {
      noFaktur: noFaktur.value||'',
      namaBarang: namaBarang.value||'',
      hargaSatuan: (hargaSatuan.value||'').replace(/[^\d]/g,''),
      qty: parseInt(qty.value||0),
      total: (totalHarga.value||'').replace(/[^\d]/g,'')
    } : null,

    buktiInvoice: [], buktiSuratJalan: [], buktiLain: [],
    deferredFiles: [] // file >1MB dimasukkan antrian
  };

  const isMatPeng = isMat;
  const pushFiles = (fileList, targetArr)=>{
    [...(fileList||[])].forEach(f=>{
      if (f.size > ONE_MB){
        // masukkan antrian
        payload.deferredFiles.push({ name:f.name, type:f.type, size:f.size, bucket:'general' });
      }else{
        const fr = new FileReader();
        const p = new Promise(res=>{
          fr.onloadend = ()=> {
            const base64 = (fr.result||'').toString().split(',')[1] || '';
            targetArr.push({ name:f.name, type:f.type, base64 });
            res();
          };
        });
        fr.readAsDataURL(f);
        readers.push(p);
      }
    });
  };

  const readers = [];
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
    .then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(d=>{
      showLoading(false);
      if(d.status==='ok'){
        showResult('success','Selesai','Data anda telah terinput.');
      }else{
        showResult('error','Terjadi Kesalahan', d.error||'Gagal menyimpan.'); 
      }
    })
    .catch(err=>{
      showLoading(false);
      const msg = err.name==='AbortError' ? 'Koneksi lambat. Coba lagi (maks 25 dtk).' :
                  (String(err).includes('Failed to fetch') ? 'Gagal terhubung ke server.' : err.message);
      showResult('error','Terjadi Kesalahan', msg);
      console.error(err);
    });
}

/* ===== Picker modal (dropdown) (tetap sama versi Anda) ===== */
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
function initNiceSelects(){
  document.querySelectorAll('select[data-nice]').forEach((sel)=>{
    if (sel.dataset.enhanced) return; sel.dataset.enhanced="1";
    sel.classList.add('native-hidden');
    const wrap = document.createElement('div'); wrap.className='nice-wrap';
    sel.parentNode.insertBefore(wrap, sel); wrap.appendChild(sel);
    const btn = document.createElement('button'); btn.type='button'; btn.className='nice-select';
    btn.setAttribute('aria-haspopup','dialog');
    btn.textContent = sel.options[sel.selectedIndex]?.text || ''; wrap.appendChild(btn);
    const open = (e)=>{ e.preventDefault(); openPicker(sel, btn); };
    btn.addEventListener('click', open); btn.addEventListener('touchstart', open, {passive:false});
  });
}
document.addEventListener('DOMContentLoaded', initNiceSelects);