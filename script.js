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
        
        const lastPage = localStorage.getItem('lastActivePage') || 'dashboard';
        showPage(lastPage);
        
        loadInitialData();
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
        loadInitialData(); // Refresh data after sync
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
        // Save form data on input
        document.body.addEventListener('input', e => {
            if(e.target.closest('form')) {
                const form = e.target.closest('form');
                const formData = new FormData(form);
                const data = Object.fromEntries(formData.entries());
                sessionStorage.setItem(form.id, JSON.stringify(data));
            }
        });
    }

    function showPage(id) {
        $$('.page').forEach(p => p.classList.remove('active'));
        const page = $(`#page-${id}`);
        if(page) page.classList.add('active');
        localStorage.setItem('lastActivePage', id);
        
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
                    sessionStorage.removeItem(form.id);
                    $$('input[type="date"]').forEach(input => input.value = fmtDate(new Date()));
                } catch(e) { showPopup('error', e.message); }
            });
            // Restore form data from sessionStorage
            const savedData = sessionStorage.getItem(form.id);
            if(savedData) {
                const data = JSON.parse(savedData);
                for(const key in data) {
                    const input = form.querySelector(`[name="${key}"]`);
                    if(input) input.value = data[key];
                }
            }
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
            $('#data-management-popup').classList.add('hidden');
            loadKreditor();
        });

        setupForm('form-add-worker', async form => {
            const data = Object.fromEntries(new FormData(form).entries());
            await addToOutbox({ ...data, ID: uuid(), action: 'add-worker' });
            loadWorkersTable();
            loadWorkers();
        });

        setupForm('form-add-proyek', async form => {
            const data = Object.fromEntries(new FormData(form).entries());
            await addToOutbox({ ...data, ID: uuid(), action: 'add-proyek' });
            loadProjectsTable();
            loadProjects();
        });

        document.body.addEventListener('click', async e => {
            if (e.target.classList.contains('delete-worker-btn')) {
                if (!confirm("Yakin ingin menghapus pekerja ini?")) return;
                await addToOutbox({ id: e.target.dataset.id, ID: uuid(), action: 'delete-worker' });
                loadWorkersTable();
            }
            if (e.target.classList.contains('delete-kreditor-btn')) {
                if (!confirm("Yakin ingin menghapus kreditor ini?")) return;
                await addToOutbox({ id: e.target.dataset.id, ID: uuid(), action: 'delete-kreditor' });
                loadKreditorTable();
            }
            if (e.target.classList.contains('delete-proyek-btn')) {
                if (!confirm("Yakin ingin menghapus proyek ini?")) return;
                await addToOutbox({ id: e.target.dataset.id, ID: uuid(), action: 'delete-proyek' });
                loadProjectsTable();
            }
        });
    }

    function renderItems() {
      const box = $('#mt-items');
      if (!box) return;
      box.innerHTML = ITEMS.length ? ITEMS.map((it, i) => `<div class="item-row"><div>${it.nama}</div><div>x${it.qty}</div><div>${rupiah(it.harga)}</div><div><strong>${rupiah(it.total)}</strong></div><button type="button" class="del" data-i="${i}">&times;</button></div>`).join('') : '<p class="empty-state">Belum ada item.</p>';
      $$('.item-row .del').forEach(b => b.onclick = () => { ITEMS.splice(b.dataset.i, 1); renderItems(); });
    }

    /* ===== Data Management Logic ===== */
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
    
    async function loadWorkers() {
       // ... (Implementation from previous correct response)
    }

    async function loadProjects() {
        // ... (Implementation from previous correct response)
    }
    
    /* ===== Monitoring Logic ===== */
    function initMonitoring() {
        // ... (Implementation from previous correct response)
    }
    
    function renderMonitoringTable(container, result) {
        // ... (Implementation from previous correct response)
    }
    
    function exportToCSV(headers, data, filename) {
        // ... (Implementation from previous correct response)
    }
    
    /* ===== Payment Page Logic ===== */
    function initPaymentPage() {
        // ... (Implementation from previous correct response)
    }
    
    /* ===== Modals & Popups Logic ===== */
    function initModals() {
        $$('.modal-close-btn').forEach(btn => btn.onclick = () => btn.closest('.modal-bg').classList.add('hidden'));
        
        const dataManagementPopup = $('#data-management-popup');
        $$('.btn-add, #btn-manage-workers').forEach(btn => btn.onclick = () => {
            dataManagementPopup.classList.remove('hidden');
            const tab = btn.dataset.target || 'pekerja';
            switchTab(tab);
        });

        $$('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        });
    }

    function switchTab(tabId) {
        $$('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
        $(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');
        $(`#tab-${tabId}`).classList.add('active');
        if(tabId === 'pekerja') loadWorkersTable();
        if(tabId === 'kreditor') loadKreditorTable();
        if(tabId === 'proyek') loadProjectsTable();
    }
    
    /* ===== Initial Data Loading ===== */
    async function loadInitialData() {
        try {
            const data = await apiCall('GET', { action: 'get-all-data' });
            await db.put(CACHE_STORE, data, 'initial-data');
            populateAllData(data);
        } catch (e) {
            console.warn("Could not load initial data, trying cache.");
            const cachedData = await db.get(CACHE_STORE, 'initial-data');
            if (cachedData) populateAllData(cachedData);
            else $$('#kpiIncome, #kpiMaterial, #kpiGaji, #kpiKas').forEach(el => el.textContent = 'Offline');
        }
    }
    
    function populateAllData(data) {
        renderDashboard(data.dashboard);
        populateWorkers(data.workers);
        populateKreditor(data.kreditor.map(k => k.Nama));
        populateProjects(data.projects);
        $('#mt-faktur').value = data.nextFaktur;
    }

    function injectPageHTML() {
        const container = $('.page-container');
        container.innerHTML += `
        <!-- ... (HTML for all pages as provided in previous responses) ... -->
        `;
    }

    init(); // Start the application
});

