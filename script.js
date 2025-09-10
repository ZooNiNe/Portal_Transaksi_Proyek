/* ==========================================
 * PKP Frontend – minimalist, mobile-first
 * ========================================== */

/* ===== Config ===== */
const SCRIPT_URL = document.body.dataset.api;

/* ===== Helpers ===== */
const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const showToast = (t) => { const n=$('#toast'); $('#toastText').textContent=t; n.classList.add('show'); setTimeout(()=>n.classList.remove('show'),1800); };
const toBase64 = (file)=> new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result.split(',')[1]); r.onerror=rej; r.readAsDataURL(file); });

/* ===== Sidebar / Router ===== */
const sidebar = $('#sidebar');
const scrim = $('#scrim');
const btnOpenNav = $('#btnOpenNav');
const btnToggleNav = $('#btnToggleNav');

const closeNav = () => {
  sidebar.classList.remove('open');
  scrim.classList.remove('show');
  btnToggleNav.classList.remove('is-rotated');
};

const openNav = () => {
  sidebar.classList.add('open');
  scrim.classList.add('show');
  btnToggleNav.classList.add('is-rotated');
};

// Menggunakan event listener untuk kedua tombol
if (btnOpenNav) {
  btnOpenNav.addEventListener('click', openNav);
}
if (btnToggleNav) {
  btnToggleNav.addEventListener('click', closeNav);
}
if (scrim) {
  scrim.addEventListener('click', closeNav);
}

$$('.nav-item[data-nav], .sub-item[data-nav]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const target = btn.dataset.nav;
    showPage(target);
    closeNav();
    
    // Perbarui status aktif pada item navigasi
    $$('.nav-item').forEach(i=>i.classList.remove('active'));
    $$('.sub-item').forEach(i=>i.classList.remove('active'));
    
    // Temukan parent .nav-item jika yang diklik adalah .sub-item
    let parentNav = btn.closest('.nav-group') ? btn.closest('.nav-group').querySelector('.nav-item') : null;
    
    if (parentNav) {
      parentNav.classList.add('active');
    } else {
      btn.classList.add('active');
    }
    // Muat data untuk halaman monitoring
    if (target === 'monitor-material') { loadMonitor('Material'); }
    if (target === 'monitor-operasional') { loadMonitor('Operasional'); }
    if (target === 'monitor-upah') { loadMonitor('Upah'); }
  });
});

$$('.nav-item[data-expand]').forEach(btn=>{
    btn.addEventListener('click', () => {
        const parent = btn.closest('.nav-group');
        parent.classList.toggle('open');
    });
});

function showPage(id){
  $$('.page').forEach(p=>p.classList.remove('active'));
  $('#page-'+id).classList.add('active');
}

/* ===== Simple state (no login) ===== */
const ME = { name:'User', role:'Admin' };
const meNameEl = $('#meName');
const meRoleEl = $('#meRole');
if (meNameEl) meNameEl.textContent = ME.name;
if (meRoleEl) meRoleEl.textContent = ME.role;


/* ===== API helpers ===== */
async function apiGet(params){
  const q = new URLSearchParams(params||{});
  const r = await fetch(`${SCRIPT_URL}?${q.toString()}`);
  if(!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}
async function apiPost(obj){
  const r = await fetch(SCRIPT_URL, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(obj)});
  if(!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}

/* ===== Dashboard ===== */
const ctx7 = $('#chart7');
let chart7;
async function loadDashboard(){
  try{
    const d = await apiGet({action:'dashboard'});
    $('#kpiIncome').textContent   = d.totalPendapatan;
    $('#kpiMaterial').textContent = d.totalMaterial;
    $('#kpiGaji').textContent     = d.totalGaji;
    $('#kpiKas').textContent      = d.kas;

    chart7 && chart7.destroy();
    chart7 = new Chart(ctx7, {
      type:'bar',
      data:{ labels:d.chart.labels, datasets:[{label:'Pengeluaran', data:d.chart.values}] },
      options:{ responsive:true, maintainAspectRatio:false }
    });
  }catch(e){ console.error(e); showToast('Gagal memuat dashboard'); }
};
if ($('#btnRefresh')) {
  $('#btnRefresh').onclick = loadDashboard;
}
loadDashboard();

/* ===== Input: Operasional ===== */
$('#form-operasional').addEventListener('submit', async (ev)=>{
  ev.preventDefault();
  const files = $('#op-files').files || [];
  const buktiLain = [];
  for (const f of files){ buktiLain.push({name:f.name, type:f.type, base64: await toBase64(f)}); }

  const res = await apiPost({
    action:'submit',
    penginput: 'webapp',
    jenis:'Pengeluaran', kategori:'Operasional',
    tanggal: $('#op-date').value,
    uraian: $('#op-uraian').value,
    nominal: $('#op-nominal').value,
    kreditor: $('#op-kreditor').value,
    status: $('#op-status').value,
    buktiLain
  });
  if (res.status==='ok'){ showToast('Tersimpan'); ev.target.reset(); }
  else showToast('Gagal menyimpan');
});

/* ===== Input: Material (multi item per faktur) ===== */
let ITEMS = []; // {nama, qty, harga, total}
const mtHarga = $('#mt-harga'), mtQty = $('#mt-qty'), mtTotal = $('#mt-total');

function calcTotal(){ const q=Number(mtQty.value||0), h=Number(mtHarga.value||0); mtTotal.value = q && h ? (q*h) : ''; }
if (mtQty) mtQty.oninput = calcTotal;
if (mtHarga) mtHarga.oninput = calcTotal;

if ($('#mt-additem')) {
  $('#mt-additem').onclick = ()=>{
    const nama = $('#mt-nama').value.trim();
    const qty  = Number($('#mt-qty').value||0);
    const harga= Number($('#mt-harga').value||0);
    if(!nama || !qty || !harga) return showToast('Lengkapi item');
    const total = qty*harga;
    ITEMS.push({nama, qty, harga, total});
    renderItems();
    $('#mt-nama').value=''; $('#mt-qty').value=''; $('#mt-harga').value=''; $('#mt-total').value='';
  };
}
if ($('#mt-clear')) {
  $('#mt-clear').onclick = ()=>{ ITEMS=[]; renderItems(); };
}

function renderItems(){
  const box = $('#mt-items');
  if (!box) return;
  if (!ITEMS.length){ box.classList.add('empty'); box.innerHTML='Belum ada item.'; return; }
  box.classList.remove('empty');
  box.innerHTML = ITEMS.map((it,i)=>`
    <div class="item-row">
      <div>${it.nama}</div>
      <div>x${it.qty}</div>
      <div>Rp ${it.harga.toLocaleString('id-ID')}</div>
      <div><strong>Rp ${it.total.toLocaleString('id-ID')}</strong></div>
      <button class="del" data-i="${i}">Hapus</button>
    </div>`).join('');
  $$('.item-row .del').forEach(btn=>{
    btn.onclick = ()=>{ ITEMS.splice(Number(btn.dataset.i),1); renderItems(); };
  });
}

// faktur otomatis
async function refreshFaktur(){
  try{ 
    const r = await apiGet({action:'nextfaktur'});
    if ($('#mt-faktur')) {
      $('#mt-faktur').value = r.faktur || '';
    }
  }catch(_){}
}
refreshFaktur();

if ($('#form-material')) {
  $('#form-material').addEventListener('submit', async (ev)=>{
    ev.preventDefault();
    if (!ITEMS.length) return showToast('Tambahkan item');
    const files = $('#mt-files').files || [];
    const buktiInvoice = [];
    for (const f of files){ buktiInvoice.push({name:f.name, type:f.type, base64: await toBase64(f)}); }

    const res = await apiPost({
      action:'submit',
      penginput:'webapp',
      jenis:'Pengeluaran', kategori:'Material',
      tanggal: $('#mt-date').value,
      noFaktur: $('#mt-faktur').value,
      kreditor: $('#mt-kreditor').value,
      status: $('#mt-status').value,
      items: ITEMS,
      buktiInvoice
    });
    if (res.status==='ok'){ showToast('Tersimpan'); ITEMS=[]; renderItems(); ev.target.reset(); refreshFaktur(); }
    else showToast('Gagal menyimpan');
  });
}

/* ===== Input: Pemasukan ===== */
if ($('#form-income')) {
  $('#form-income').addEventListener('submit', async (ev)=>{
    ev.preventDefault();
    const files = $('#in-files').files || [];
    const buktiLain = [];
    for (const f of files){ buktiLain.push({name:f.name, type:f.type, base64: await toBase64(f)}); }
    const res = await apiPost({
      action:'submit',
      penginput:'webapp',
      jenis:'Pemasukan', kategori:'-',
      tanggal: $('#in-date').value,
      uraian: $('#in-uraian').value,
      nominal: $('#in-nominal').value,
      buktiLain
    });
    if (res.status==='ok'){ showToast('Tersimpan'); ev.target.reset(); }
    else showToast('Gagal');
  });
}

/* ===== Input: Pembayaran ===== */
if ($('#form-pay')) {
  $('#form-pay').addEventListener('submit', async (ev)=>{
    ev.preventDefault();
    const files = $('#pay-files').files || [];
    const buktiLain = [];
    for (const f of files){ buktiLain.push({name:f.name, type:f.type, base64: await toBase64(f)}); }
    const res = await apiPost({
      action:'submit',
      penginput:'webapp',
      jenis:'Pengeluaran', kategori:'Pembayaran',
      tanggal: $('#pay-date').value,
      uraian: `${$('#pay-jenis').value} • ${$('#pay-ref').value}`,
      nominal: $('#pay-nominal').value,
      kreditor: $('#pay-pihak').value,
      status: $('#pay-metode').value,
      buktiLain
    });
    if (res.status==='ok'){ showToast('Tersimpan'); ev.target.reset(); }
    else showToast('Gagal');
  });
}

/* ===== Absensi ===== */
if ($('#form-absen')) {
  $('#form-absen').addEventListener('submit', async (ev)=>{
    ev.preventDefault();
    const f = $('#ab-foto').files[0];
    const foto = f ? {name:f.name, type:f.type, base64: await toBase64(f)} : null;
    const res = await apiPost({
      action:'submit_absen',
      penginput:'webapp',
      tanggal: $('#ab-date').value,
      proyek: $('#ab-proyek').value,
      pegawai: $('#ab-pegawai').value,
      status: $('#ab-status').value,
      lembur: $('#ab-lembur').value,
      foto
    });
    if (res.status==='ok'){ showToast('Absensi tersimpan'); ev.target.reset(); }
    else showToast('Gagal simpan');
  });
}

/* ===== Monitoring Total (simple) ===== */
let chartFlow;
if ($('#mon-apply')) {
  $('#mon-apply').onclick = async ()=>{
    try{
      const r = await apiGet({action:'monitor', kind:'total', range: $('#mon-range').value});
      const ctx = $('#chartFlow');
      const labels = ['Pemasukan','Pengeluaran','Material','Operasional','Gaji/Upah'];
      const values = [
        num(r.totalPemasukan), num(r.totalPengeluaran),
        num(r.byKategori['Material']), num(r.byKategori['Operasional']), num(r.byKategori['Gaji']) || num(r.byKategori['Upah'])
      ];
      chartFlow && chartFlow.destroy();
      chartFlow = new Chart(ctx, { type:'bar', data:{labels, datasets:[{label:'Total (Rp)', data:values}]}, options:{responsive:true, maintainAspectRatio:false} });
    }catch(e){ console.error(e); showToast('Gagal memuat monitor'); }
  };
}
function num(rp){ return Number(String(rp||'').replace(/[^\d]/g,''))||0; }

/* ===== Monitoring Tabel ===== */
async function loadMonitor(kind) {
  try {
    const container = $(`#tbl-${kind}-container`);
    if (!container) return;
    container.innerHTML = 'Memuat data...';

    const startDate = $(`#mon-${kind}-start`).value;
    const endDate = $(`#mon-${kind}-end`).value;

    const params = { action: 'monitor-transaksi', kind: kind };
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    const r = await apiGet(params);
    
    if (r.data && r.data.length > 0) {
      renderTable(container, r.data, r.headers);
    } else {
      container.innerHTML = '<p>Tidak ada data ditemukan.</p>';
    }
  } catch (e) {
    console.error(e);
    showToast('Gagal memuat data monitoring');
  }
}

function renderTable(container, data, headers) {
  const table = document.createElement('table');
  table.classList.add('data-table');
  
  // Header
  const thead = table.createTHead();
  const headerRow = thead.insertRow();
  headers.forEach(headerText => {
    const th = document.createElement('th');
    th.textContent = headerText;
    headerRow.appendChild(th);
  });
  
  // Body
  const tbody = table.createTBody();
  data.forEach(rowData => {
    const tr = tbody.insertRow();
    rowData.forEach(cellData => {
      const td = tr.insertCell();
      td.textContent = cellData;
    });
  });
  
  // Clear container and append table
  container.innerHTML = '';
  container.appendChild(table);
}

// Event Listeners untuk filter monitoring tabel
['material', 'operasional', 'upah'].forEach(kind => {
  if ($(`#mon-${kind}-apply`)) {
    $(`#mon-${kind}-apply`).onclick = () => loadMonitor(kind);
  }
  if ($(`#btn-download-${kind}`)) {
    $(`#btn-download-${kind}`).onclick = () => {
      // Implementasi unduh ke Excel
      const dataTable = $(`#tbl-${kind}-container .data-table`);
      if (dataTable) {
        const wb = XLSX.utils.table_to_book(dataTable);
        XLSX.writeFile(wb, `${kind}_data.xlsx`);
      } else {
        showToast('Tidak ada data untuk diunduh');
      }
    };
  }
});
