/* =======================================================
 * PKP Frontend v2.2 - Stability and Caching Fixes
 * ======================================================= */
document.addEventListener('DOMContentLoaded', () => {
  const SCRIPT_URL = document.body.dataset.api;
  const DB_NAME = 'pkp-db';
  const DB_VERSION = 1;
  const OUTBOX_STORE = 'outbox';
  const CACHE_STORE = 'cache';
  let db;
  let currentMonitoringData = { headers: [], data: [] };
  let ITEMS = [];

  /* ===== Helpers ===== */
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const toBase64 = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });
  const uuid = () => ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
  const rupiah = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);
  const num = (v) => Number(String(v || '').replace(/[^\d]/g, ''));
  const fmtDate = (d) => { try { return new Date(d).toISOString().split('T')[0]; } catch(e) { return ''; } };
  
  let popupTimeout;
  function showPopup(kind, text) {
      clearTimeout(popupTimeout);
      const p = $('#popup-container');
      if (!p) return;
      p.className = 'popup-container show popup-' + kind;
      const iconEl = $('#popup-icon');
      iconEl.className = kind === 'loading' ? 'spinner' : 'material-symbols-outlined';
      iconEl.textContent = kind === 'success' ? 'check_circle' : (kind === 'error' ? 'cancel' : '');
      $('#popup-message').textContent = text;
      if (kind !== 'loading') {
          popupTimeout = setTimeout(() => p.classList.remove('show'), 4000);
      }
  }
  
  const compressImage = (file, quality = 0.7, maxWidth = 1024) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = event => {
          const img = new Image();
          img.src = event.target.result;
          img.onload = () => {
              const canvas = document.createElement('canvas');
              const scale = Math.min(1, maxWidth / img.width);
              canvas.width = img.width * scale;
              canvas.height = img.height * scale;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              canvas.toBlob(blob => {
                  if (!blob) { reject(new Error('Canvas is empty')); return; }
                  resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
              }, 'image/jpeg', quality);
          };
          img.onerror = reject;
      };
      reader.onerror = reject;
  });

  /* ===== Service Worker & DB Initialization ===== */
  async function init() {
      if ('serviceWorker' in navigator) {
          try { await navigator.serviceWorker.register('sw.js'); } catch (e) { console.error('SW registration failed:', e); }
      }
      db = await idb.openDB(DB_NAME, DB_VERSION, {
          upgrade(db) {
              if (!db.objectStoreNames.contains(OUTBOX_STORE)) { db.createObjectStore(OUTBOX_STORE, { keyPath: 'id' }); }
              if (!db.objectStoreNames.contains(CACHE_STORE)) { db.createObjectStore(CACHE_STORE); }
          },
      });
      injectPageHTML();
      initUI();
      initForms();
      initModals();
      initMonitoring();
      updateConnectionStatus();
      window.addEventListener('online', updateConnectionStatus);
      window.addEventListener('offline', updateConnectionStatus);
      loadDashboard();
  }
  
  /* ===== Offline Sync & Caching Logic ===== */
  const connectionStatusEl = $('#connection-status');
  async function updateConnectionStatus() {
      if (!connectionStatusEl) return;
      const outboxCount = await db.count(OUTBOX_STORE);
      if (!navigator.onLine) {
          connectionStatusEl.className = 'connection-status offline';
          $('.status-text').textContent = `Offline (${outboxCount} tertunda)`;
      } else {
          if (outboxCount > 0) {
              connectionStatusEl.className = 'connection-status syncing';
              $('.status-text').textContent = `Menyinkronkan...`;
              syncData();
          } else {
              connectionStatusEl.className = 'connection-status online';
              $('.status-text').textContent = 'Online';
          }
      }
  }

  async function syncData() {
      if (!navigator.onLine) return;
      const items = await db.getAll(OUTBOX_STORE);
      if (items.length === 0) { updateConnectionStatus(); return; }
      
      showPopup('loading', 'Menyinkronkan data...');
      for (const item of items) {
          try {
              const body = { ...item.payload };
              if (body.files && body.files.length > 0) {
                  body.files = await Promise.all(body.files.map(async f => ({ name: f.name, type: f.type, base64: await toBase64(new Blob([f.blob], {type: f.type})) })));
              }
              await apiCall('POST', body);
              await db.delete(OUTBOX_STORE, item.id);
          } catch (error) {
              console.error('Sync failed for item:', item, error);
              showPopup('error', `Gagal sinkronisasi. Coba lagi nanti.`);
              break; 
          }
      }
      showPopup('success', 'Semua data telah sinkron.');
      updateConnectionStatus();
  }
  
  async function addToOutbox(payload) {
      if (payload.files && payload.files.length > 0) {
          const processedFiles = [];
          for (const file of Array.from(payload.files)) {
              let processedFile = file;
              if (file.type.startsWith('image/')) {
                  try { processedFile = await compressImage(file); } catch (e) { console.error("Could not compress image, sending original.", e); }
              }
              processedFiles.push({ name: processedFile.name, type: processedFile.type, blob: processedFile });
          }
          payload.files = processedFiles;
      }
      await db.put(OUTBOX_STORE, { id: payload.ID, payload });
      showPopup('success', 'Data disimpan. Akan disinkronkan saat online.');
      updateConnectionStatus();
  }

  /* ===== UI & Navigation ===== */
  function initUI() {
      const sidebar = $('#sidebar'), scrim = $('#scrim');
      $('#btnOpenNav').onclick = () => { sidebar.classList.add('open'); scrim.classList.add('show'); };
      scrim.onclick = () => { sidebar.classList.remove('open'); scrim.classList.remove('show'); };
      $$('.nav-item, .sub-item').forEach(btn => {
          if (!btn.dataset.nav) return;
          btn.addEventListener('click', () => {
              showPage(btn.dataset.nav);
              if (window.innerWidth <= 768) {
                  sidebar.classList.remove('open');
                  scrim.classList.remove('show');
              }
              $$('.nav-item.active, .sub-item.active').forEach(i => i.classList.remove('active'));
              btn.classList.add('active');
              if (btn.closest('.nav-group')) {
                  btn.closest('.nav-group').querySelector('.nav-item').classList.add('active');
              }
          });
      });
      $$('.nav-group > .nav-item[data-expand]').forEach(b => b.onclick = () => b.parentElement.classList.toggle('open'));
      $('#btnRefresh').onclick = loadDashboard;
      document.body.addEventListener('input', e => {
          if (e.target.classList.contains('currency-input')) {
              const val = e.target.value.replace(/[^\d]/g, '');
              e.target.value = val ? parseInt(val, 10).toLocaleString('id-ID') : '';
          }
      });
  }

  function showPage(id) {
      $$('.page').forEach(p => p.classList.remove('active'));
      const page = $(`#page-${id}`);
      if(page) page.classList.add('active');
      
      const monitorId = id.startsWith('monitor-') ? id.split('-')[1] : null;
      if (monitorId) page.querySelector('.filter-btn').dispatchEvent(new Event('click'));
      if (id === 'pembayaran') initPaymentPage();
      if (id === 'absensi') { loadWorkers(); loadProjects(); }
      if (id.startsWith('input-')) { loadKreditor(); }
      if (id === 'input-material') { refreshFaktur(); }
  }

  /* ===== API Call ===== */
  async function apiCall(method, params) {
      if (!navigator.onLine) throw new Error('Saat ini offline.');
      let response;
      if (method === 'GET') {
          response = await fetch(`${SCRIPT_URL}?${new URLSearchParams(params)}`);
      } else {
          response = await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(params), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
      }
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      return result;
  }
  
  /* ===== Form Handlers ===== */
  function initForms() {
      const setupForm = (formId, handler) => {
          const form = $(`#${formId}`);
          if (!form) return;
          form.addEventListener('submit', async ev => {
              ev.preventDefault();
              showPopup('loading', 'Menyimpan data lokal...');
              try {
                  await handler(form);
                  form.reset();
                  $$('input[type="date"]').forEach(input => input.value = fmtDate(new Date()));
              } catch(e) { showPopup('error', e.message); }
          });
      };

      setupForm('form-operasional', async form => {
          const data = Object.fromEntries(new FormData(form).entries());
          data.nominal = num(data.nominal);
          const payload = { ...data, ID: uuid(), action: 'submit', jenis: 'Pengeluaran', kategori: 'Operasional', files: $('#op-files').files };
          await addToOutbox(payload);
      });

      setupForm('form-material', async form => {
          if (ITEMS.length === 0) throw new Error('Tambahkan minimal satu item.');
          const data = Object.fromEntries(new FormData(form).entries());
          const payload = { ...data, ID: uuid(), action: 'submit', jenis: 'Pengeluaran', kategori: 'Material', items: ITEMS, files: $('#mt-files').files };
          await addToOutbox(payload);
          ITEMS = []; renderItems(); refreshFaktur();
      });

      $('#mt-additem').onclick = () => {
          const nama = $('#mt-nama').value.trim(), qty = +$('#mt-qty').value, harga = num($('#mt-harga').value);
          if (!nama || !qty || !harga) return showPopup('error', 'Lengkapi detail item');
          ITEMS.push({ nama, qty, harga, total: qty * harga });
          renderItems();
          $('#mt-nama').value = ''; $('#mt-qty').value = ''; $('#mt-harga').value = ''; $('#mt-total').value = '';
      };
      $('#mt-clear').onclick = () => { ITEMS = []; renderItems(); };
      const updateTotal = () => $('#mt-total').value = (+$('#mt-qty').value * num($('#mt-harga').value)).toLocaleString('id-ID');
      $('#mt-harga').addEventListener('input', updateTotal);
      $('#mt-qty').addEventListener('input', updateTotal);
      renderItems();
      
      setupForm('form-pemasukan', async form => {
          const data = Object.fromEntries(new FormData(form).entries());
          data.nominal = num(data.nominal);
          const payload = { ...data, ID: uuid(), action: 'submit', jenis: 'Pemasukan', kategori: data.jenisPemasukan, files: $('#in-files').files };
          await addToOutbox(payload);
      });

      $('#in-jenis').onchange = e => {
          const pinjamanDetails = $('#pinjaman-details');
          if (e.target.value === 'Pinjaman') pinjamanDetails.classList.remove('hidden');
          else pinjamanDetails.classList.add('hidden');
      };
      $('#in-jenis-pinjaman').onchange = e => {
          const bungaDetails = $('#bunga-details');
          if (e.target.value === 'Berbunga') bungaDetails.classList.remove('hidden');
          else bungaDetails.classList.add('hidden');
      };

      setupForm('form-absensi', async form => {
          const data = Object.fromEntries(new FormData(form).entries());
          const sel = $('#ab-pegawai');
          const opt = sel.options[sel.selectedIndex];
          if (!opt || !opt.value) throw new Error("Pilih pegawai.");
          data.pegawai = opt.text.split(' (')[0];
          data.profesi = opt.dataset.profesi;
          data.upah = opt.dataset.upah;
          data.lembur = num(data.lembur);
          const payload = { ...data, ID: uuid(), action: 'submit_absen', files: $('#ab-foto').files };
          await addToOutbox(payload);
      });
      $('#ab-pegawai').onchange = (e) => {
          const opt = e.target.options[e.target.selectedIndex];
          $('#ab-profesi').value = opt.dataset.profesi || '';
          $('#ab-upah').value = opt.dataset.upah ? num(opt.dataset.upah).toLocaleString('id-ID') : '';
      };

      setupForm('form-add-kreditor', async form => {
          const data = Object.fromEntries(new FormData(form).entries());
          await addToOutbox({ ...data, ID: uuid(), action: 'add-kreditor' });
          $('#kreditor-popup').classList.add('hidden');
          loadKreditor();
      });

      setupForm('form-add-worker', async form => {
          const data = Object.fromEntries(new FormData(form).entries());
          await addToOutbox({ ...data, ID: uuid(), action: 'add-worker' });
          loadWorkersTable();
          loadWorkers();
      });
      document.body.addEventListener('click', async e => {
          if (e.target.classList.contains('delete-worker-btn')) {
              if (!confirm("Yakin ingin menghapus pekerja ini?")) return;
              await addToOutbox({ id: e.target.dataset.id, ID: uuid(), action: 'delete-worker' });
              loadWorkersTable();
              loadWorkers();
          }
      });
  }

  function renderItems() {
    const box = $('#mt-items');
    if (!box) return;
    box.innerHTML = ITEMS.length ? ITEMS.map((it, i) => `<div class="item-row"><div>${it.nama}</div><div>x${it.qty}</div><div>${rupiah(it.harga)}</div><div><strong>${rupiah(it.total)}</strong></div><button type="button" class="del" data-i="${i}">&times;</button></div>`).join('') : '<p class="empty-state">Belum ada item.</p>';
    $$('.item-row .del').forEach(b => b.onclick = () => { ITEMS.splice(b.dataset.i, 1); renderItems(); });
  }

  /* ===== Kreditor & Worker Logic ===== */
  async function loadKreditor() {
      try {
          const { kreditor } = await apiCall('GET', { action: 'list-kreditor' });
          await db.put(CACHE_STORE, kreditor, 'kreditor');
          populateKreditor(kreditor);
      } catch(e) {
          console.warn("Could not load kreditor, trying cache.");
          const cached = await db.get(CACHE_STORE, 'kreditor');
          if(cached) populateKreditor(cached);
      }
  }
  function populateKreditor(kreditor) {
      const selects = $$('#op-kreditor, #mt-kreditor');
      selects.forEach(sel => {
          const currentVal = sel.value;
          sel.innerHTML = '<option value="">-- Pilih Kreditor --</option>' + kreditor.map(k => `<option value="${k}">${k}</option>`).join('');
          sel.value = currentVal;
      });
  }
  
  async function loadWorkers() {
      try {
          const { workers } = await apiCall('GET', { action: 'list-workers' });
          await db.put(CACHE_STORE, workers, 'workers');
          populateWorkers(workers);
      } catch(e) {
          console.warn("Could not load workers, trying cache.");
          const cached = await db.get(CACHE_STORE, 'workers');
          if(cached) populateWorkers(cached);
      }
  }
  function populateWorkers(workers) {
      $('#ab-pegawai').innerHTML = '<option value="">-- Pilih Pegawai --</option>' + workers.map(w => `<option value="${w.ID}" data-profesi="${w.Profesi}" data-upah="${w.UpahHarian}">${w.Nama} (${w.Profesi})</option>`).join('');
  }

  async function loadWorkersTable() {
      const container = $('#worker-list');
      container.innerHTML = '<p class="empty-state">Memuat...</p>';
      try {
          const { workers } = await apiCall('GET', { action: 'list-workers' });
          container.innerHTML = workers.length ? `<table><thead><tr><th>Nama</th><th>Profesi</th><th>Upah</th><th>Aksi</th></tr></thead><tbody>
          ${workers.map(w => `<tr><td>${w.Nama}</td><td>${w.Profesi}</td><td>${rupiah(w.UpahHarian)}</td><td><button class="delete-worker-btn" data-id="${w.ID}">Hapus</button></td></tr>`).join('')}
          </tbody></table>` : '<p class="empty-state">Belum ada pekerja.</p>';
      } catch(e) { container.innerHTML = '<p class="empty-state">Gagal memuat.</p>'; }
  }
  
  /* ===== Monitoring Logic ===== */
  function initMonitoring() {
      $$('.monitor-page').forEach(page => {
          const kind = page.dataset.kind;
          const container = page.querySelector('.table-container');
          const action = kind === 'arus-kas' ? 'monitor-arus-kas' : 'monitor-transaksi';
          
          page.querySelector('.filter-btn').addEventListener('click', async () => {
              container.innerHTML = `<p class="empty-state">Memuat data...</p>`;
              try {
                  const params = { action, kind, startDate: page.querySelector('.filter-start').value, endDate: page.querySelector('.filter-end').value };
                  const result = await apiCall('GET', params);
                  await db.put(CACHE_STORE, result, `monitor-${kind}`);
                  renderMonitoringTable(container, result);
              } catch (e) {
                  console.warn(`Could not load monitor-${kind}, trying cache.`);
                  const cached = await db.get(CACHE_STORE, `monitor-${kind}`);
                  if(cached) renderMonitoringTable(container, cached);
                  else container.innerHTML = `<p class="empty-state">Gagal memuat data. Periksa koneksi Anda.</p>`;
              }
          });

          page.querySelector('.download-btn').addEventListener('click', () => {
              if (!currentMonitoringData.data || currentMonitoringData.data.length === 0) { showPopup('error', 'Tidak ada data untuk diunduh.'); return; }
              const filename = `monitoring_${kind}_${new Date().toISOString().split('T')[0]}.csv`;
              exportToCSV(currentMonitoringData.headers, currentMonitoringData.data, filename);
          });
      });
  }

  function renderMonitoringTable(container, result) {
      currentMonitoringData = result;
      const { headers, data } = result;
      if (!data || data.length === 0) { container.innerHTML = `<p class="empty-state">Tidak ada data untuk rentang yang dipilih.</p>`; return; }
      container.innerHTML = `<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${data.map(row => `<tr>${row.map((cell, i) => `<td>${(typeof cell === 'number' && i > 0) ? rupiah(cell) : cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  
  function exportToCSV(headers, data, filename) {
      const csvContent = [headers.join(','), ...data.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  }
  
  /* ===== Payment Page Logic ===== */
  function initPaymentPage() {
      const container = $('#payment-table-container');
      const summaryEl = $('#payment-summary span');
      const payBtn = $('#btn-pay-selected');
      let allItems = [];

      const loadUnpaidItems = async () => {
          container.innerHTML = `<p class="empty-state">Memuat tagihan...</p>`;
          payBtn.disabled = true; payBtn.textContent = `Bayar Item Terpilih (0)`;
          summaryEl.textContent = `Pilih item untuk dibayar`;
          try {
              const { data } = await apiCall('GET', { action: 'get-unpaid-items' });
              await db.put(CACHE_STORE, data, 'unpaid-items');
              renderUnpaidItems(data);
          } catch (e) {
              console.warn("Could not load unpaid items, trying cache.");
              const cached = await db.get(CACHE_STORE, 'unpaid-items');
              if(cached) renderUnpaidItems(cached);
              else container.innerHTML = `<p class="empty-state">Gagal memuat tagihan. Periksa koneksi Anda.</p>`;
          }
      };
      
      function renderUnpaidItems(data) {
          allItems = data;
          if (data.length === 0) { container.innerHTML = `<p class="empty-state">Tidak ada tagihan yang perlu dibayar.</p>`; return; }
          container.innerHTML = `<table><thead><tr><th><input type="checkbox" id="select-all-payments"></th><th>Tanggal</th><th>Uraian</th><th>Kategori</th><th>Kreditor</th><th>Nominal</th></tr></thead><tbody>
              ${data.map(item => `<tr><td><input type="checkbox" class="payment-item-check" data-id="${item.id}" data-type="${item.type}"></td><td>${fmtDate(item.tanggal)}</td><td>${item.uraian}</td><td>${item.kategori}</td><td>${item.kreditor}</td><td>${rupiah(item.nominal)}</td></tr>`).join('')}
          </tbody></table>`;
      }
      
      container.addEventListener('change', e => {
          if (e.target.matches('.payment-item-check, #select-all-payments')) {
              if (e.target.id === 'select-all-payments') { $$('.payment-item-check').forEach(chk => chk.checked = e.target.checked); }
              const selectedChecks = $$('.payment-item-check:checked');
              const selectedItems = selectedChecks.map(chk => allItems.find(item => item.id === chk.dataset.id)).filter(Boolean);
              const total = selectedItems.reduce((sum, item) => sum + num(item.nominal), 0);
              payBtn.disabled = selectedItems.length === 0;
              payBtn.textContent = `Bayar Item Terpilih (${selectedItems.length})`;
              summaryEl.textContent = selectedItems.length > 0 ? `Total terpilih: ${rupiah(total)}` : `Pilih item untuk dibayar`;
          }
      });

      payBtn.addEventListener('click', async () => {
          const selectedItems = $$('.payment-item-check:checked').map(chk => ({ id: chk.dataset.id, type: chk.dataset.type }));
          if (selectedItems.length === 0 || !confirm(`Anda akan membayar ${selectedItems.length} item. Lanjutkan?`)) return;
          await addToOutbox({ action: 'pay-multiple-items', items: selectedItems, ID: uuid() });
          loadUnpaidItems();
      });
      loadUnpaidItems();
  }
  
  /* ===== Modals ===== */
  function initModals() {
      $$('.modal-close-btn').forEach(btn => btn.onclick = () => btn.closest('.modal-bg').classList.add('hidden'));
      $$('.btn-add[data-target="kreditor"]').forEach(btn => btn.onclick = () => $('#kreditor-popup').classList.remove('hidden'));
      $('#btn-manage-workers').onclick = () => { $('#worker-popup').classList.remove('hidden'); loadWorkersTable(); }
  }
  
  async function loadDashboard() {
      try {
          const data = await apiCall('GET', { action: 'dashboard' });
          await db.put(CACHE_STORE, data, 'dashboard');
          renderDashboard(data);
      } catch (e) {
          console.warn("Dashboard could not be loaded, trying cache.");
          const cachedData = await db.get(CACHE_STORE, 'dashboard');
          if (cachedData) renderDashboard(cachedData);
          else $$('#kpiIncome, #kpiMaterial, #kpiGaji, #kpiKas').forEach(el => el.textContent = 'Offline');
      }
  }
  
  function renderDashboard(d) {
      $('#kpiIncome').textContent = d.totalPendapatan;
      $('#kpiMaterial').textContent = d.totalMaterial;
      $('#kpiGaji').textContent = d.totalGaji;
      $('#kpiKas').textContent = d.kas;
      if (window.chart7) window.chart7.destroy();
      const chartEl = $('#chart7');
      if (!chartEl) return;
      window.chart7 = new Chart(chartEl, {
          type: 'bar', data: { labels: d.chart.labels, datasets: [{ data: d.chart.values, backgroundColor: '#3b82f6', borderRadius: 4 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
      });
  }

  async function refreshFaktur() {
      try {
          const { faktur } = await apiCall('GET', { action: 'nextfaktur' });
          $('#mt-faktur').value = faktur;
      } catch(e) { console.warn("Could not get next faktur number while offline.")}
  }

  async function loadProjects() {
      try {
          const { projects } = await apiCall('GET', { action: 'listproyek' });
          await db.put(CACHE_STORE, projects, 'projects');
          populateProjects(projects);
      } catch(e) {
          console.warn("Could not load projects, trying cache.");
          const cached = await db.get(CACHE_STORE, 'projects');
          if(cached) populateProjects(cached);
      }
  }

  function populateProjects(projects) {
      $('#ab-proyek').innerHTML = '<option value="">-- Pilih Proyek --</option>' + projects.map(p => `<option value="${p}">${p}</option>`).join('');
  }

  function injectPageHTML() {
      const container = $('.page-container');
      container.innerHTML += `
      <!-- INPUT PEMASUKAN -->
      <main id="page-input-pemasukan" class="page">
        <div class="form-title"><h3>Input Pemasukan</h3></div>
        <form id="form-pemasukan" class="form card" autocomplete="off">
          <div class="form-group"><label for="in-date">Tanggal</label><input id="in-date" name="tanggal" type="date" required></div>
          <div class="form-group"><label for="in-jenis">Jenis Pemasukan</label>
            <select id="in-jenis" name="jenisPemasukan"><option value="Termin">Termin</option><option value="Pinjaman">Pinjaman</option></select>
          </div>
          <div id="pinjaman-details" class="hidden">
              <div class="form-group"><label for="in-jenis-pinjaman">Jenis Pinjaman</label>
                  <select id="in-jenis-pinjaman" name="jenisPinjaman"><option value="Tidak Berbunga">Tidak Berbunga</option><option value="Berbunga">Berbunga</option></select>
              </div>
              <div id="bunga-details" class="grid-2 hidden">
                  <div class="form-group"><label for="in-tenor">Tenor (Bulan)</label><input id="in-tenor" name="tenor" type="number" min="1"></div>
                  <div class="form-group"><label for="in-bunga">Bunga (%)</label><input id="in-bunga" name="bunga" type="number" min="0" step="0.1"></div>
              </div>
          </div>
          <div class="form-group"><label for="in-uraian">Uraian</label><input id="in-uraian" name="uraian" type="text" placeholder="Termin ke-1 Proyek X..." required></div>
          <div class="form-group"><label for="in-nominal">Nominal (Rp)</label><input id="in-nominal" name="nominal" class="currency-input" type="text" placeholder="10000000" required></div>
          <div class="form-group"><label for="in-files">Lampiran (opsional)</label><input id="in-files" type="file" accept="image/*,.pdf" multiple></div>
          <button type="submit" class="btn btn-primary w-full">Simpan Pemasukan</button>
        </form>
      </main>
      <!-- INPUT OPERASIONAL -->
      <main id="page-input-operasional" class="page">
        <div class="form-title"><h3>Belanja Operasional</h3></div>
        <form id="form-operasional" class="form card" autocomplete="off">
          <div class="form-group"><label for="op-date">Tanggal</label><input id="op-date" name="tanggal" type="date" required></div>
          <div class="form-group">
            <label for="op-kreditor">Kreditor/Vendor</label>
            <div class="input-with-button">
              <select id="op-kreditor" name="kreditor" required></select>
              <button type="button" class="btn-add" data-target="kreditor" aria-label="Tambah Kreditor"><span class="material-symbols-outlined">add</span></button>
            </div>
          </div>
          <div class="form-group"><label for="op-uraian">Uraian</label><input id="op-uraian" name="uraian" type="text" placeholder="Keterangan singkat…" required></div>
          <div class="form-group"><label for="op-nominal">Nominal (Rp)</label><input id="op-nominal" name="nominal" class="currency-input" type="text" placeholder="50000" required></div>
          <div class="form-group"><label for="op-status">Status</label><select id="op-status" name="status"><option>Sudah Dibayar</option><option>Belum Dibayar</option><option>Tempo</option></select></div>
          <div class="form-group"><label for="op-files">Lampiran (opsional)</label><input id="op-files" type="file" accept="image/*,.pdf" multiple></div>
          <button type="submit" class="btn btn-primary w-full">Simpan Transaksi</button>
        </form>
      </main>
      <!-- INPUT MATERIAL -->
      <main id="page-input-material" class="page">
          <div class="form-title"><h3>Belanja Material</h3></div>
          <form id="form-material" class="form card" autocomplete="off">
              <div class="grid-2">
                  <div class="form-group"><label for="mt-date">Tanggal</label><input id="mt-date" name="tanggal" type="date" required></div>
                  <div class="form-group"><label for="mt-faktur">No Faktur</label><input id="mt-faktur" name="noFaktur" type="text" placeholder="Otomatis" readonly></div>
              </div>
              <div class="form-group">
                <label for="mt-kreditor">Kreditor/Supplier</label>
                <div class="input-with-button">
                  <select id="mt-kreditor" name="kreditor" required></select>
                  <button type="button" class="btn-add" data-target="kreditor" aria-label="Tambah Kreditor"><span class="material-symbols-outlined">add</span></button>
                </div>
              </div>
              <div class="form-group"><label for="mt-status">Status</label><select id="mt-status" name="status"><option>Sudah Dibayar</option><option>Belum Dibayar</option><option>Tempo</option></select></div>
              <div class="card-header" style="padding-left:0; padding-right:0;"><h5>Item Belanja</h5></div>
              <div id="mt-items" class="items empty"></div>
              <div class="item-adder">
                  <div class="grid-2"><div class="form-group"><label for="mt-nama">Nama Barang</label><input id="mt-nama" type="text"></div><div class="form-group"><label for="mt-qty">Qty</label><input id="mt-qty" type="number" min="1"></div></div>
                  <div class="grid-2"><div class="form-group"><label for="mt-harga">Harga Satuan</label><input id="mt-harga" class="currency-input" type="text"></div><div class="form-group"><label for="mt-total">Total</label><input id="mt-total" type="text" readonly></div></div>
                  <div class="btn-group" style="margin-top: 1rem;"><button id="mt-additem" type="button" class="btn btn-secondary">Tambah Item</button><button id="mt-clear" type="button" class="btn btn-ghost">Bersihkan</button></div>
              </div>
              <div class="form-group"><label for="mt-files">Lampiran</label><input id="mt-files" type="file" accept="image/*,.pdf" multiple></div>
              <button type="submit" class="btn btn-primary w-full">Simpan Faktur</button>
          </form>
      </main>
      <!-- PEMBAYARAN -->
      <main id="page-pembayaran" class="page">
          <div class="form-title"><h3>Pembayaran Terintegrasi</h3></div>
          <div class="card">
              <div id="payment-summary" class="payment-summary">
                  <span>Pilih item untuk dibayar</span>
                  <button id="btn-pay-selected" class="btn btn-primary" disabled>Bayar Item Terpilih (0)</button>
              </div>
              <div id="payment-table-container" class="table-container"><p class="empty-state">Memuat tagihan...</p></div>
          </div>
      </main>
      <!-- ABSENSI -->
      <main id="page-absensi" class="page">
        <div class="form-title"><h3>Absensi Harian</h3><button id="btn-manage-workers" class="btn btn-secondary"><span class="material-symbols-outlined">group</span><span>Manajemen Pekerja</span></button></div>
        <form id="form-absensi" class="form card">
          <div class="grid-2">
              <div class="form-group"><label for="ab-date">Tanggal</label><input id="ab-date" name="tanggal" type="date" required></div>
              <div class="form-group"><label for="ab-proyek">Proyek</label><select id="ab-proyek" name="proyek" required></select></div>
          </div>
          <div class="form-group"><label for="ab-pegawai">Nama Pegawai</label><select id="ab-pegawai" name="pegawaiId" required></select></div>
          <div class="grid-2">
              <div class="form-group"><label for="ab-profesi">Profesi</label><input id="ab-profesi" type="text" readonly></div>
              <div class="form-group"><label for="ab-upah">Upah Harian (Rp)</label><input id="ab-upah" class="currency-input" type="text" readonly></div>
          </div>
          <div class="grid-2">
            <div class="form-group"><label for="ab-status">Status Kehadiran</label><select id="ab-status" name="status"><option>Masuk</option><option>Setengah Hari</option><option>Izin</option><option>Sakit</option><option>Alpha</option><option>Cuti</option></select></div>
            <div class="form-group"><label for="ab-lembur">Lembur (jam)</label><input id="ab-lembur" name="lembur" type="number" min="0" max="12" value="0"></div>
          </div>
          <div class="form-group"><label for="ab-foto">Foto (opsional)</label><input id="ab-foto" type="file" accept="image/*"></div>
          <button type="submit" class="btn btn-primary w-full">Simpan Absensi</button>
        </form>
      </main>
      <!-- MONITORING PAGES -->
      <main id="page-monitor-arus-kas" class="page monitor-page" data-kind="arus-kas">
          <div class="form-title"><h3>Rekap Arus Kas Total</h3></div>
          <div class="card">
              <div class="monitor-controls">
                  <div class="form-group"><label>Dari Tanggal</label><input type="date" class="filter-start"></div>
                  <div class="form-group"><label>Sampai Tanggal</label><input type="date" class="filter-end"></div>
                  <button class="btn btn-secondary filter-btn"><span class="material-symbols-outlined">filter_alt</span> Terapkan</button>
                  <button class="btn btn-secondary download-btn"><span class="material-symbols-outlined">download</span> Unduh</button>
              </div>
              <div class="table-container"><p class="empty-state">Gunakan filter untuk menampilkan data.</p></div>
          </div>
      </main>
      <main id="page-monitor-material" class="page monitor-page" data-kind="material">
          <div class="form-title"><h3>Monitoring Material</h3></div>
          <div class="card">
              <div class="monitor-controls">
                  <div class="form-group"><label>Dari Tanggal</label><input type="date" class="filter-start"></div>
                  <div class="form-group"><label>Sampai Tanggal</label><input type="date" class="filter-end"></div>
                  <button class="btn btn-secondary filter-btn"><span class="material-symbols-outlined">filter_alt</span> Terapkan</button>
                  <button class="btn btn-secondary download-btn"><span class="material-symbols-outlined">download</span> Unduh</button>
              </div>
              <div class="table-container"><p class="empty-state">Gunakan filter untuk menampilkan data.</p></div>
          </div>
      </main>
      <main id="page-monitor-operasional" class="page monitor-page" data-kind="operasional">
          <div class="form-title"><h3>Monitoring Operasional</h3></div>
          <div class="card">
              <div class="monitor-controls">
                  <div class="form-group"><label>Dari Tanggal</label><input type="date" class="filter-start"></div>
                  <div class="form-group"><label>Sampai Tanggal</label><input type="date" class="filter-end"></div>
                  <button class="btn btn-secondary filter-btn"><span class="material-symbols-outlined">filter_alt</span> Terapkan</button>
                  <button class="btn btn-secondary download-btn"><span class="material-symbols-outlined">download</span> Unduh</button>
              </div>
              <div class="table-container"><p class="empty-state">Gunakan filter untuk menampilkan data.</p></div>
          </div>
      </main>
      <main id="page-monitor-upah" class="page monitor-page" data-kind="upah">
          <div class="form-title"><h3>Monitoring Upah/Gaji</h3></div>
          <div class="card">
              <div class="monitor-controls">
                  <div class="form-group"><label>Dari Tanggal</label><input type="date" class="filter-start"></div>
                  <div class="form-group"><label>Sampai Tanggal</label><input type="date" class="filter-end"></div>
                  <button class="btn btn-secondary filter-btn"><span class="material-symbols-outlined">filter_alt</span> Terapkan</button>
                  <button class="btn btn-secondary download-btn"><span class="material-symbols-outlined">download</span> Unduh</button>
              </div>
              <div class="table-container"><p class="empty-state">Gunakan filter untuk menampilkan data.</p></div>
          </div>
      </main>
      `;
  }

  init(); // Start the application
});

