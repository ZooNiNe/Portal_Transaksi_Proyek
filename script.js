<script>
// @ts-check
/* =======================================================
 * PKP Frontend v5.2 - Final Build (Firebase Architecture)
 * ======================================================= */

/**
 * @global {any} firebase
 * @global {any} Chart
 */

// Define custom properties on the Window interface for TypeScript
window.Chart = window.Chart || {};

document.addEventListener('DOMContentLoaded', () => {
  // =================================================================
  // PENTING: PASTE KONFIGURASI FIREBASE ANDA DI SINI
  // =================================================================
  const firebaseConfig = {
    apiKey: "AIzaSyBDTURKKzmhG8hZXlBryoQRdjqd70GI18c",
    authDomain: "banflex-3e7c4.firebaseapp.com",
    projectId: "banflex-3e7c4",
    storageBucket: "banflex-3e7c4.appspot.com",
    messagingSenderId: "192219628345",
    appId: "1:192219628345:web:f1caa28230a5803e681ee8"
  };
  // =================================================================

  // Initialize Firebase
  firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();
  const auth = firebase.auth();

  /** @type {any[]} */
  let ITEMS = [];
  /** @type {Chart | null} */
  let dashboardChart = null;
  let currentUser = null;     // Holds user auth object
  let userRole = 'Guest';     // Holds user role from Firestore
  let listeners = [];         // To hold Firestore listeners

  /* ===== Helpers ===== */
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const rupiah = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);
  const num = (v) => Number(String(v || '').replace(/[^\d]/g, ''));
  const fmtDate = (d) => { try { return new Date(d).toISOString().split('T')[0]; } catch(e) { return ''; } };

  let popupTimeout, slowLoginTimer;
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
    messageEl.textContent = text;
    if (kind !== 'loading') {
      popupTimeout = setTimeout(() => p.classList.remove('show'), 4000);
    }
  }

  /* ===== Firebase Initialization & Auth ===== */
  async function init() {
    try {
      await db.enablePersistence();
      console.log("Firebase Offline Persistence enabled.");
    } catch (err) {
      if (err.code == 'failed-precondition') {
        console.warn("Multiple tabs open, persistence can only be enabled in one tab at a time.");
      } else if (err.code == 'unimplemented') {
        console.warn("The current browser does not support all of the features required to enable persistence.");
      }
    }

    injectPageHTML();
    initUI();
    initAuth();
    initForms();
    initModals();
    initMonitoring();
    initInstallPrompt();

    // Saat awal buka, default ke dashboard (guest view)
    showPage('dashboard');
  }

  function initAuth() {
    auth.onAuthStateChanged(async (user) => {
      if (user) {
        currentUser = user;

        // Tampilkan loading & langsung arahkan ke dashboard
        showPopup('loading', 'Menyiapkan dashboard...');
        localStorage.setItem('lastActivePage', 'dashboard');
        showPage('dashboard');

        try {
          await checkUserRole(user);
        } catch (e) {
          console.warn('Gagal cek role:', e);
          userRole = 'Pending';
        }

        updateUIForUser();
        attachDataListeners();

        // Tutup modal login bila masih terbuka
        $('#login-modal')?.classList.add('hidden');

        if (userRole === 'Pending') {
          // Jelaskan status pending, jangan blank
          const pendingEmailEl = $('#pending-email');
          if (pendingEmailEl) pendingEmailEl.textContent = user.email;
          $('#pending-auth-modal')?.classList.remove('hidden');
          showPopup('success', 'Login berhasil. Akun menunggu persetujuan.');
        } else {
          showPopup('success', 'Login berhasil. Selamat datang!');
        }
      } else {
        // Logged out
        currentUser = null;
        userRole = 'Guest';
        updateUIForUser();
        detachDataListeners();
        clearAllData();

        // Saat logout, pastikan tetap di dashboard (guest)
        localStorage.setItem('lastActivePage', 'dashboard');
        showPage('dashboard');
      }
    });

    const authBtn = $('#auth-btn');
    const googleLoginBtn = $('#google-login-btn');
    const authDropdownBtn = $('#auth-dropdown-btn');

    const handleLogin = async () => {
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        showPopup('loading', 'Mengautentikasi...');
        // Warning kalau login lambat
        clearTimeout(slowLoginTimer);
        slowLoginTimer = setTimeout(() => {
          showPopup('error', 'Login lambat. Cek koneksi/internet atau coba ulang.');
          // Tetap biarkan proses login berjalan di belakang
        }, 10000);
        await auth.signInWithPopup(provider);
      } catch (err) {
        showPopup('error', err?.message || 'Gagal login.');
      } finally {
        clearTimeout(slowLoginTimer);
      }
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
    } else {
      userRole = userDoc.data().role || 'Pending';
    }
  }

  /* ===== UI & Navigation ===== */
  function initUI() {
    const sidebar = $('#sidebar'), scrim = $('#scrim');
    if (!sidebar || !scrim) return;

    const btnOpenNav = $('#btnOpenNav');
    if (btnOpenNav) btnOpenNav.onclick = () => { sidebar.classList.add('open'); scrim.classList.add('show'); };

    scrim.onclick = () => { sidebar.classList.remove('open'); scrim.classList.remove('show'); };

    $$('[data-nav]').forEach(btn => {
      if (!(btn instanceof HTMLElement) || !btn.dataset.nav) return;
      btn.addEventListener('click', () => {
        showPage(btn.dataset.nav);
        if (window.innerWidth <= 992) {
          sidebar.classList.remove('open');
          scrim.classList.remove('show');
        }
      });
    });

    $$('[data-nav-link]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const navId = (el instanceof HTMLElement) ? el.dataset.navLink : null;
        if (navId) {
          const monitorTarget = (el instanceof HTMLElement) ? el.dataset.monitorTarget : null;
          const targetNavElement = $(`.nav-item[data-nav="${navId}"]`);
          if (targetNavElement instanceof HTMLElement) {
            targetNavElement.click();
            if (monitorTarget) {
              setTimeout(() => {
                const targetTab = $(`#page-monitoring .tab-btn[data-kategori="${monitorTarget}"]`);
                if (targetTab instanceof HTMLElement) targetTab.click();
              }, 50);
            }
          }
        }
      });
    });

    $$('[data-quick-link]').forEach(el => {
      el.addEventListener('click', () => {
        if (el instanceof HTMLElement) {
          const navId = el.dataset.quickLink;
          const formTarget = el.dataset.formTarget;
          if (navId) {
            const targetNavElement = $(`.nav-item[data-nav="${navId}"]`);
            if (targetNavElement instanceof HTMLElement) {
              targetNavElement.click();
              if (formTarget) {
                setTimeout(() => {
                  const targetTab = $(`#input-type-selector .tab-btn[data-form="${formTarget}"]`);
                  if (targetTab instanceof HTMLElement) targetTab.click();
                }, 50);
              }
            }
          }
        }
      });
    });

    const btnRefresh = $('#btnRefresh');
    if (btnRefresh) btnRefresh.onclick = (e) => {
      e.stopPropagation();
      attachDataListeners();
    };

    const themeToggleBtn = $('#theme-toggle-btn');
    if (themeToggleBtn) {
      themeToggleBtn.onclick = () => {
        document.body.classList.toggle('dark-theme');
        localStorage.setItem('theme', document.body.classList.contains('dark-theme') ? 'dark' : 'light');
      };
    }
    if (localStorage.getItem('theme') === 'dark') {
      document.body.classList.add('dark-theme');
    }

    const searchBtn = $('#global-search-btn');
    const searchContainer = $('#global-search-container');
    if (searchBtn && searchContainer) {
      searchBtn.onclick = () => {
        searchContainer.classList.toggle('active');
        if (searchContainer.classList.contains('active')) {
          $('#global-search-input')?.focus();
        }
      }
    }

    const userProfileBtn = $('#user-profile-btn');
    const userDropdown = $('#user-dropdown');
    if (userProfileBtn && userDropdown) {
      userProfileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        userDropdown.classList.toggle('show');
      });
    }

    const notificationBtn = $('#notification-btn');
    const notificationDropdown = $('#notification-dropdown');
    if (notificationBtn && notificationDropdown) {
      notificationBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        notificationDropdown.classList.toggle('show');
      });
    }

    window.addEventListener('click', (e) => {
      const target = e.target;
      if (userDropdown && !userDropdown.contains(target) && userProfileBtn && !userProfileBtn.contains(target)) {
        userDropdown.classList.remove('show');
      }
      if (notificationDropdown && !notificationDropdown.contains(target) && notificationBtn && !notificationBtn.contains(target)) {
        notificationDropdown.classList.remove('show');
      }
    });
  }

  function showPage(id) {
    // Pastikan elemen page tersedia
    $$('.page').forEach(p => p.classList.remove('active'));
    const page = $(`#page-${id}`);
    if (page) page.classList.add('active');

    localStorage.setItem('lastActivePage', id);

    $$('.nav-item.active').forEach(el => el.classList.remove('active'));
    const navButton = $(`.nav-item[data-nav="${id}"]`);
    if (navButton) navButton.classList.add('active');
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
      const initial = currentUser.displayName ? currentUser.displayName.charAt(0) : 'U';
      const avatarUrl = currentUser.photoURL || `https://placehold.co/40x40/3b82f6/ffffff?text=${initial}`;
      if (userAvatar) userAvatar.src = avatarUrl;
      if (userDropdownAvatar) userDropdownAvatar.src = avatarUrl.replace('40x40', '60x60');
      if (userDropdownName) userDropdownName.textContent = currentUser.displayName || 'User';
      if (userDropdownEmail) userDropdownEmail.textContent = currentUser.email || '';

      if (authText) authText.textContent = 'Keluar';
      if (authIcon) authIcon.textContent = 'logout';
      if (authBtn) authBtn.classList.add('danger');

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
      if (authBtn) authBtn.classList.remove('danger');

      if (authDropdownBtn) {
        authDropdownBtn.innerHTML = `<span class="material-symbols-outlined">login</span><span>Login dengan Google</span>`;
        authDropdownBtn.classList.remove('danger');
      }
    }

    // Sembunyikan/lihat elemen berdasarkan role
    $$('[data-role]').forEach(el => {
      if (el instanceof HTMLElement) {
        const roles = el.dataset.role.split(',').map(s => s.trim());
        el.style.display = roles.includes(userRole) ? '' : 'none';
      }
    });
  }

  function clearAllData() {
    $$('.kpi h3').forEach(el => el.innerHTML = rupiah(0));
    const a = $('#dashboard-absensi-container');
    const b = $('#recent-activity-container');
    const c = $('#upcoming-bills-container');
    const d = $('#bills-list-container');
    if (a) a.innerHTML = '';
    if (b) b.innerHTML = '';
    if (c) c.innerHTML = '';
    if (d) d.innerHTML = '';
    if (dashboardChart) dashboardChart.destroy();
  }

  function attachDataListeners() {
    detachDataListeners();
    if (!currentUser) return;
    showPopup('loading', 'Memuat data...');
    const uid = currentUser.uid;

    const workersRef = db.collection('users').doc(uid).collection('workers');
    const workerListener = workersRef.onSnapshot(snapshot => {
      const workers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      populateWorkers(workers);
    }, err => console.error("Error fetching workers:", err));
    listeners.push(workerListener);

    showPopup('success', 'Data real-time aktif.');
  }

  function detachDataListeners() {
    listeners.forEach(unsubscribe => unsubscribe && unsubscribe());
    listeners = [];
  }

  /* ===== Form/Modal/Monitoring Stub ===== */
  function initForms(){ /* ... */ }
  function initModals(){ /* ... */ }
  function initMonitoring(){ /* ... */ }
  function populateWorkers(workers){ /* ... */ }

  function initStokMaterialPage() {}
  function initPengaturanPage() {}
  function initTagihanPage() {}
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

    if (installBtn) installBtn.addEventListener('click', async () => {
      installToast?.classList.add('hidden');
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        deferredPrompt = null;
      }
    });

    if (dismissInstallBtn) dismissInstallBtn.addEventListener('click', () => {
      installToast?.classList.add('hidden');
    });

    window.addEventListener('appinstalled', () => {
      installToast?.classList.add('hidden');
    });
  }

  function injectPageHTML() {
    const container = $('.page-container');
    if (!container) return;
    // Pastikan ada page-dashboard (akses untuk Guest & semua role)
    container.innerHTML += `
      <main id="page-dashboard" class="page active" data-role="Guest,Pending,User,Admin,Owner">
        <!-- Dashboard content from index.html -->
      </main>
      <main id="page-input-data" class="page" data-role="User,Admin,Owner">
        <!-- Input Data page content -->
      </main>
      <main id="page-absensi" class="page" data-role="User,Admin,Owner">
        <!-- Absensi page content -->
      </main>
      <main id="page-stok-material" class="page" data-role="User,Admin,Owner">
        <!-- Stok Material page content -->
      </main>
      <main id="page-tagihan" class="page" data-role="User,Admin,Owner">
        <!-- Tagihan page content -->
      </main>
      <main id="page-monitoring" class="page" data-role="User,Admin,Owner">
        <!-- Laporan/Monitoring page content -->
      </main>
      <main id="page-pengaturan" class="page" data-role="Admin,Owner">
        <!-- Pengaturan page content -->
      </main>
    `;
  }

  init(); // Start the application
});
</script>
