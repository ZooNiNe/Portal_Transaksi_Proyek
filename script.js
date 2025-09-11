// @ts-check
/* =======================================================
 * PKP Frontend v5.2 - Final Build (Auth Redirect Fixed)
 * Firebase v8 (namespaced)
 * ======================================================= */

/* global firebase, Chart */

document.addEventListener('DOMContentLoaded', () => {
  // =====================================================
  // 1) KONFIGURASI FIREBASE
  // =====================================================
  const firebaseConfig = {
    apiKey: "AIzaSyBDTURKKzmhG8hZXlBryoQRdjqd70GI18c",
    authDomain: "banflex-3e7c4.firebaseapp.com",
    projectId: "banflex-3e7c4",
    storageBucket: "banflex-3e7c4.appspot.com",
    messagingSenderId: "192219628345",
    appId: "1:192219628345:web:f1caa28230a5803e681ee8"
  };

  // =====================================================
  // 2) INIT FIREBASE
  // =====================================================
  firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();
  const auth = firebase.auth();

  // =====================================================
  // 3) STATE & HELPERS
  // =====================================================
  /** @type {any[]} */ let ITEMS = [];
  /** @type {Chart | null} */ let dashboardChart = null;
  /** @type {firebase.User|null} */ let currentUser = null;
  let userRole = 'Guest';
  /** @type {Array<() => void>} */ let listeners = [];
  let popupTimeout;

  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const rupiah = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);
  const fmtDate = (d) => { try { return new Date(d).toISOString().split('T')[0]; } catch { return ''; } };
  const isMobile = /Mobi|Android/i.test(navigator.userAgent);

  function showPopup(kind, text) {
    clearTimeout(popupTimeout);
    const p = $('#popup-container');
    if (!p) return;
    p.className = 'popup-container show popup-' + kind;
    const iconEl = $('#popup-icon');
    const messageEl = $('#popup-message');
    if (!iconEl || !messageEl) return;
    iconEl.className = kind === 'loading' ? 'spinner' : 'material-symbols-outlined';
    iconEl.textContent = kind === 'success' ? 'check_circle' : (kind === 'error' ? 'cancel' : '');
    messageEl.textContent = text || '';
    if (kind !== 'loading') {
      popupTimeout = setTimeout(() => p.classList.remove('show'), 4000);
    }
  }

  // =====================================================
  // 4) BOOTSTRAP APP
  // =====================================================
  (async function init() {
    // Offline persistence (best-effort)
    try { await db.enablePersistence(); }
    catch (err) {
      if (err && err.code === 'failed-precondition') console.warn('Persistence gagal: multi-tab.');
      else if (err && err.code === 'unimplemented') console.warn('Browser tidak support persistence.');
    }

    injectPageHTML();
    initUI();
    initAuthBindings();   // pasang handler tombol login/logout dulu

    // Ambil hasil redirect kalau flow login pakai redirect (mobile)
    try { await auth.getRedirectResult(); }
    catch (e) { console.warn('Redirect result error:', e); }

    // Dengarkan status auth → sumber kebenaran untuk navigasi
    initAuthState();

    initForms();
    initModals();
    initMonitoring();
    initInstallPrompt();

    // Jangan paksa showPage di sini; tunggu auth siap di onAuthStateChanged
  })();

  // =====================================================
  // 5) AUTH: LISTENER & HANDLERS
  // =====================================================
  function initAuthState() {
    auth.onAuthStateChanged(async (user) => {
      // Dipanggil SELALU minimal sekali pada start
      if (user) {
        currentUser = user;
        await checkUserRole(user);
        updateUIForUser();
        attachDataListeners();

        // Tutup modal login bila terbuka & arahkan ke dashboard
        $('#login-modal')?.classList.add('hidden');
        showPage('dashboard');
      } else {
        currentUser = null;
        userRole = 'Guest';
        updateUIForUser();
        detachDataListeners();
        clearAllData();

        // App sederhana → tetap di dashboard dengan mode Guest
        showPage('dashboard');
      }
    });
  }

  function initAuthBindings() {
    const authBtn = $('#auth-btn');
    const googleLoginBtn = $('#google-login-btn');
    const authDropdownBtn = $('#auth-dropdown-btn');

    const handleLogin = () => {
      const provider = new firebase.auth.GoogleAuthProvider();
      const promise = isMobile
        ? auth.signInWithRedirect(provider)  // stabil di mobile
        : auth.signInWithPopup(provider);    // enak di desktop
      promise.catch(err => showPopup('error', err.message));
    };

    const handleLogout = () => auth.signOut();

    if (authBtn) authBtn.addEventListener('click', () => {
      if (currentUser) handleLogout();
      else $('#login-modal')?.classList.remove('hidden');
    });

    if (googleLoginBtn) googleLoginBtn.addEventListener('click', handleLogin);

    if (authDropdownBtn) authDropdownBtn.addEventListener('click', () => {
      if (currentUser) handleLogout();
      else {
        $('#user-dropdown')?.classList.add('hidden');
        $('#login-modal')?.classList.remove('hidden');
      }
    });
  }

  async function checkUserRole(user) {
    const userRef = db.collection('users').doc(user.uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      await userRef.set({
        email: user.email,
        name: user.displayName,
        avatar: user.photoURL,
        role: 'Pending',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      userRole = 'Pending';
      const el = $('#pending-email'); if (el) el.textContent = user.email || '';
      $('#pending-auth-modal')?.classList.remove('hidden');
    } else {
      userRole = userDoc.data().role || 'Guest';
    }
  }

  // =====================================================
  // 6) UI & NAV
  // =====================================================
  function initUI() {
    const sidebar = $('#sidebar'), scrim = $('#scrim');
    const btnOpenNav = $('#btnOpenNav');
    if (btnOpenNav) btnOpenNav.onclick = () => { sidebar?.classList.add('open'); scrim?.classList.add('show'); };
    scrim?.addEventListener('click', () => { sidebar?.classList.remove('open'); scrim?.classList.remove('show'); });

    $$('[data-nav]').forEach(btn => {
      if (!(btn instanceof HTMLElement) || !btn.dataset.nav) return;
      btn.addEventListener('click', () => {
        showPage(btn.dataset.nav);
        if (window.innerWidth <= 992) { sidebar?.classList.remove('open'); scrim?.classList.remove('show'); }
      });
    });

    $$('[data-nav-link]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const navId = (el instanceof HTMLElement) ? el.dataset.navLink : null;
        if (navId) {
          document.querySelector(`.nav-item[data-nav="${navId}"]`)?.dispatchEvent(new Event('click'));
        }
      });
    });

    $$('[data-quick-link]').forEach(el => {
      el.addEventListener('click', () => {
        if (!(el instanceof HTMLElement)) return;
        const navId = el.dataset.quickLink;
        const formTarget = el.dataset.formTarget;
        if (!navId) return;
        document.querySelector(`.nav-item[data-nav="${navId}"]`)?.dispatchEvent(new Event('click'));
        if (formTarget) {
          setTimeout(() => {
            const targetTab = document.querySelector(`#input-type-selector .tab-btn[data-form="${formTarget}"]`);
            if (targetTab instanceof HTMLElement) targetTab.click();
          }, 50);
        }
      });
    });

    $('#btnRefresh')?.addEventListener('click', (e) => { e.stopPropagation(); attachDataListeners(); });

    const themeToggleBtn = $('#theme-toggle-btn');
    if (themeToggleBtn) {
      themeToggleBtn.onclick = () => {
        document.body.classList.toggle('dark-theme');
        localStorage.setItem('theme', document.body.classList.contains('dark-theme') ? 'dark' : 'light');
      };
      if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark-theme');
    }

    const userProfileBtn = $('#user-profile-btn');
    const userDropdown = $('#user-dropdown');
    userProfileBtn?.addEventListener('click', (e) => { e.stopPropagation(); userDropdown?.classList.toggle('show'); });

    const notificationBtn = $('#notification-btn');
    const notificationDropdown = $('#notification-dropdown');
    notificationBtn?.addEventListener('click', (e) => { e.stopPropagation(); notificationDropdown?.classList.toggle('show'); });

    window.addEventListener('click', (e) => {
      const t = e.target;
      if (userDropdown && !userDropdown.contains(t) && userProfileBtn && !userProfileBtn.contains(t)) userDropdown.classList.remove('show');
      if (notificationDropdown && !notificationDropdown.contains(t) && notificationBtn && !notificationBtn.contains(t)) notificationDropdown.classList.remove('show');
    });
  }

  function showPage(id) {
    $$('.page').forEach(p => p.classList.remove('active'));
    const page = $(`#page-${id}`);
    if (page) page.classList.add('active');
    localStorage.setItem('lastActivePage', id);
    $$('.nav-item.active').forEach(el => el.classList.remove('active'));
    const navButton = $(`.nav-item[data-nav="${id}"]`);
    navButton?.classList.add('active');
  }

  function updateUIForUser() {
    const userAvatar = $('#user-avatar');
    const userDropdownAvatar = $('#user-dropdown-avatar');
    const userDropdownName = $('#user-dropdown-name');
    const userDropdownEmail = $('#user-dropdown-email');
    const authBtn = $('#auth-btn');
    const authText = authBtn?.querySelector('.nav-text');
    const authIcon = authBtn?.querySelector('.material-symbols-outlined');
    const authDropdownBtn = $('#auth-dropdown-btn');

    if (currentUser) {
      const initial = (currentUser.displayName || 'U').charAt(0).toUpperCase();
      const avatarUrl = currentUser.photoURL || `https://placehold.co/40x40/3b82f6/ffffff?text=${initial}`;
      if (userAvatar) userAvatar.src = avatarUrl;
      if (userDropdownAvatar) userDropdownAvatar.src = avatarUrl.replace('40x40', '60x60');
      if (userDropdownName) userDropdownName.textContent = currentUser.displayName || 'User';
      if (userDropdownEmail) userDropdownEmail.textContent = currentUser.email || '';

      if (authText) authText.textContent = 'Keluar';
      if (authIcon) authIcon.textContent = 'logout';
      authBtn?.classList.add('danger');

      if (authDropdownBtn) {
        authDropdownBtn.innerHTML = `<span class="material-symbols-outlined">logout</span><span>Keluar</span>`;
        authDropdownBtn.classList.add('danger');
      }
    } else {
      const guestAvatar = 'https://placehold.co/40x40/e2e8f0/64748b?text=G';
      if (userAvatar) userAvatar.src = guestAvatar;
      if (userDropdownAvatar) userDropdownAvatar.src = guestAvatar.replace('40x40', '60x60');
      if (userDropdownName) userDropdownName.textContent = 'Guest';
      if (userDropdownEmail) userDropdownEmail.textContent = 'Silakan login';

      if (authText) authText.textContent = 'Login';
      if (authIcon) authIcon.textContent = 'login';
      authBtn?.classList.remove('danger');

      if (authDropdownBtn) {
        authDropdownBtn.innerHTML = `<span class="material-symbols-outlined">login</span><span>Login dengan Google</span>`;
        authDropdownBtn.classList.remove('danger');
      }
    }

    // Show/hide elemen berdasar role
    $$('[data-role]').forEach(el => {
      if (el instanceof HTMLElement) {
        const roles = (el.dataset.role || '').split(',').map(s => s.trim());
        el.style.display = roles.includes(userRole) ? '' : 'none';
      }
    });
  }

  // =====================================================
  // 7) DATA LISTENERS
  // =====================================================
  function attachDataListeners() {
    detachDataListeners();
    if (!currentUser) return;
    showPopup('loading', 'Memuat data…');
    const uid = currentUser.uid;

    const workersRef = db.collection('users').doc(uid).collection('workers');
    const unsubWorkers = workersRef.onSnapshot(
      (snap) => {
        const workers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        populateWorkers(workers);
        showPopup('success', 'Data real-time aktif.');
      },
      (err) => { console.error('Workers error:', err); showPopup('error', 'Gagal memuat data.'); }
    );
    listeners.push(unsubWorkers);
  }

  function detachDataListeners() {
    listeners.forEach(unsub => { try { unsub(); } catch {} });
    listeners = [];
  }

  function clearAllData() {
    $$('.kpi h3').forEach(el => { el.innerHTML = rupiah(0); });
    $('#dashboard-absensi-container')?.replaceChildren();
    $('#recent-activity-container')?.replaceChildren();
    $('#upcoming-bills-container')?.replaceChildren();
    $('#bills-list-container')?.replaceChildren();
    if (dashboardChart) { try { dashboardChart.destroy(); } catch {} dashboardChart = null; }
  }

  // =====================================================
  // 8) FORMS / MODALS / MONITORING (STUB)
  // =====================================================
  function initForms(){ /* …isi sesuai kebutuhan… */ }
  function initModals(){ /* …isi sesuai kebutuhan… */ }
  function initMonitoring(){ /* …isi sesuai kebutuhan… */ }
  function populateWorkers(workers){ /* …render daftar pekerja… */ }

  // =====================================================
  // 9) PWA INSTALL
  // =====================================================
  function initInstallPrompt() {
    let deferredPrompt;
    const installToast = $('#install-toast');
    const installBtn = $('#install-btn');
    const dismissInstallBtn = $('#dismiss-install-btn');

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      installToast?.classList.remove('hidden');
    });

    installBtn?.addEventListener('click', async () => {
      installToast?.classList.add('hidden');
      if (deferredPrompt) {
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
      }
    });

    dismissInstallBtn?.addEventListener('click', () => installToast?.classList.add('hidden'));
    window.addEventListener('appinstalled', () => installToast?.classList.add('hidden'));
  }

  // =====================================================
  // 10) INJECT HALAMAN (placeholder)
  // =====================================================
  function injectPageHTML() {
    const container = $('.page-container');
    if (!container) return;
    container.innerHTML += `
      <main id="page-dashboard" class="page active">
        <!-- Dashboard content -->
      </main>
      <main id="page-input-data" class="page"><!-- Input Data --></main>
      <main id="page-absensi" class="page"><!-- Absensi --></main>
      <main id="page-stok-material" class="page"><!-- Stok Material --></main>
      <main id="page-tagihan" class="page"><!-- Tagihan --></main>
      <main id="page-monitoring" class="page"><!-- Monitoring --></main>
      <main id="page-pengaturan" class="page"><!-- Pengaturan --></main>
    `;
  }
});
