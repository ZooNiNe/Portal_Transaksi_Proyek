// @ts-check
/* =======================================================
 * PKP Frontend v5.3 - Final Revised (Firebase v8)
 * ======================================================= */

/**
 * @global {any} firebase
 * @global {any} Chart
 */

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

  // Init Firebase v8
  firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();
  const auth = firebase.auth();

  /** @type {any[]} */
  let ITEMS = [];
  /** @type {Chart | null} */
  let dashboardChart = null;
  /** @type {firebase.User|null} */
  let currentUser = null;
  /** @type {"Guest"|"Pending"|"User"|"Admin"|"Owner"} */
  let userRole = 'Guest';
  /** @type {Array<() => void>} */
  let listeners = [];

  // === Konfigurasi akses & fallback owner ===
  const OWNER_EMAILS = ['dq060412@gmail.com']; // <-- ganti ke email Owner kamu
  const ALLOWED_WHEN_PENDING = new Set(['dashboard','monitoring']); // id halaman yang boleh untuk Pending

  // === Helpers
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const rupiah = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);
  const num = (v) => Number(String(v || '').replace(/[^\d]/g, ''));
  const fmtDate = (d) => { try { return new Date(d).toISOString().split('T')[0]; } catch { return ''; } };
  const isOwner = () => userRole === 'Owner';
  const isPending = () => userRole === 'Pending';

  let popupTimeout, slowLoginTimer;

  function showPopup(kind, text) {
    clearTimeout(popupTimeout);
    const p = $('#popup-container');
    if (!p) return;
    p.className = 'popup-container show popup-' + kind; // popup-success | popup-error | popup-loading
    const iconEl = $('#popup-icon');
    const messageEl = $('#popup-message');
    if (iconEl && messageEl) {
      iconEl.className = kind === 'loading' ? 'spinner' : 'material-symbols-outlined';
      iconEl.textContent = kind === 'success' ? 'check_circle' : (kind === 'error' ? 'cancel' : '');
      messageEl.textContent = text;
    }
    if (kind !== 'loading') {
      popupTimeout = setTimeout(() => p.classList.remove('show'), 4000);
    }
  }

  function setConnectionStatus(kind, text) {
    const el = $('#connection-status');
    if (!el) return;
    el.className = `connection-status ${kind}`; // guest | pending | connected
    const t = el.querySelector('.status-text');
    if (t) t.textContent = text;
  }

  function forceTo(id) {
    localStorage.setItem('lastActivePage', id);
    showPage(id);
  }

  function canNavigateTo(id) {
    if (isOwner()) return true;
    if (isPending()) return ALLOWED_WHEN_PENDING.has(id);
    return true;
  }

  /* ===== Firebase Initialization & Auth ===== */
  async function init() {
    // Offline persistence
    try {
      await db.enablePersistence();
      console.log("Firebase Offline Persistence enabled.");
    } catch (err) {
      if (err && err.code === 'failed-precondition') {
        console.warn("Multiple tabs open, persistence can only be enabled in one tab at a time.");
      } else if (err && err.code === 'unimplemented') {
        console.warn("This browser doesn't fully support persistence.");
      }
    }

    // Keep session (tetap login)
    try {
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    } catch (e) {
      console.warn('Set persistence failed:', e);
    }

    injectPageHTML();
    initUI();
    initAuth();
    initForms();
    initModals();
    initMonitoring();
    initInstallPrompt();

    // Tangani hasil redirect (Safari/iOS/popup terblokir)
    await handleRedirectResult();

    // Health check koneksi Firestore/Auth
    firebaseHealthCheck();

    const lastPage = localStorage.getItem('lastActivePage') || 'dashboard';
    showPage(lastPage);
  }

  function initAuth() {
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        currentUser = null;
        userRole = 'Guest';
        updateUIForUser();
        detachDataListeners();
        clearAllData();
        setConnectionStatus('guest', 'Tidak terhubung');
        document.body.classList.toggle('is-guest', true);
        document.body.classList.toggle('is-pending', false);
        return forceTo('dashboard');
      }

      currentUser = user;
      // Lindungi dari blank: segera ke dashboard
      forceTo('dashboard');
      showPopup('loading', 'Menyiapkan akun...');

      // Dapatkan role (custom claims > Firestore > whitelist email)
      userRole = await resolveUserRole(user);

      updateUIForUser();
      attachDataListeners();

      // State body (opsional untuk CSS helper)
      document.body.classList.toggle('is-guest', false);
      document.body.classList.toggle('is-pending', userRole === 'Pending');

      // Aturan navigasi untuk Pending
      const last = localStorage.getItem('lastActivePage') || 'dashboard';
      if (!canNavigateTo(last)) forceTo('dashboard');

      // Modal pending info
      if (isPending()) {
        $('#pending-email')?.textContent = user.email || '';
        $('#pending-auth-modal')?.classList.remove('hidden');
        setConnectionStatus('pending', `Menunggu persetujuan (${user.email})`);
        showPopup('success', 'Login berhasil. Status akun: Pending');
      } else {
        $('#pending-auth-modal')?.classList.add('hidden');
        setConnectionStatus('connected', `Terhubung sebagai ${user.email}`);
        showPopup('success', 'Login berhasil.');
      }
    });

    const authBtn = $('#auth-btn');
    const googleLoginBtn = $('#google-login-btn');
    const authDropdownBtn = $('#auth-dropdown-btn');

    const handleLogin = async () => {
      const provider = new firebase.auth.GoogleAuthProvider();
      // (opsional) tambah scope jika perlu API Google lain:
      // provider.addScope('https://www.googleapis.com/auth/drive.readonly');

      try {
        showPopup('loading', 'Mengautentikasi dengan Google...');
        clearTimeout(slowLoginTimer);
        slowLoginTimer = setTimeout(() => {
          showPopup('error', 'Login lambat. Cek koneksi atau coba ulang.');
        }, 10000);

        await auth.signInWithPopup(provider);

        const u = auth.currentUser;
        if (u) showPopup('success', `Terhubung sebagai ${u.email}`);
      } catch (err) {
        // Domain belum di-whitelist di Firebase Auth
        if (err?.code === 'auth/unauthorized-domain') {
          return showPopup('error', 'Domain belum diizinkan di Firebase Auth. Tambahkan "zoonine.github.io" ke Authorized domains.');
        }
        // Popup diblokir → fallback redirect
        if (err?.code === 'auth/popup-blocked' || err?.code === 'auth/operation-not-supported-in-this-environment') {
          showPopup('loading', 'Pop-up diblokir. Menggunakan redirect...');
          const provider = new firebase.auth.GoogleAuthProvider();
          return auth.signInWithRedirect(provider);
        }
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

  /**
   * Ambil role dari custom claims (otoritatif).
   * Fallback: Firestore users/{uid}.role.
   * Fallback terakhir: OWNER_EMAILS (auto Owner) atau 'Pending'.
   * Menjaga dokumen users/{uid} selalu tersedia untuk UI.
   * @param {firebase.User} user
   * @returns {Promise<"Pending"|"User"|"Admin"|"Owner">}
   */
  async function resolveUserRole(user) {
    const email = (user.email || '').toLowerCase();
    const isEmailOwner = OWNER_EMAILS.map(e => e.toLowerCase()).includes(email);

    // 1) Custom claims (sumber kebenaran)
    try {
      const token = await user.getIdTokenResult(true);
      if (token.claims && token.claims.role) {
        const roleFromClaims = /** @type any */(token.claims.role);
        await mirrorUserDoc(user, roleFromClaims); // sinkron UI (tidak otoritatif)
        return roleFromClaims;
      }
    } catch (e) {
      console.warn('getIdTokenResult failed:', e);
    }

    // 2) Firestore fallback
    try {
      const userRef = db.collection('users').doc(user.uid);
      const snap = await userRef.get();
      if (snap.exists) {
        const data = snap.data() || {};
        if (data.role) return /** @type any */(data.role);
        // kalau ada doc tapi tak ada role, set default
        const role = isEmailOwner ? 'Owner' : 'Pending';
        await userRef.set({ role }, { merge: true });
        return role;
      } else {
        const role = isEmailOwner ? 'Owner' : 'Pending';
        await userRef.set({
          email: user.email || '',
          name: user.displayName || '',
          avatar: user.photoURL || '',
          role,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return role;
      }
    } catch (e) {
      console.warn('Fallback Firestore role error:', e);
    }

    // 3) Fallback terakhir (tanpa DB)
    return /** @type any */(isEmailOwner ? 'Owner' : 'Pending');
  }

  async function mirrorUserDoc(user, role) {
    try {
      await db.collection('users').doc(user.uid).set({
        email: user.email || '',
        name: user.displayName || '',
        avatar: user.photoURL || '',
        role
      }, { merge: true });
    } catch (e) {
      console.warn('Mirror user doc failed:', e);
    }
  }

  // ===== Firebase Health Check =====
  async function firebaseHealthCheck() {
    try {
      const ver = firebase.SDK_VERSION || '(unknown)';
      console.log('[HealthCheck] Firebase SDK version:', ver);
      if (!firebase.apps || !firebase.apps.length) {
        showPopup('error', 'Firebase belum initialize (apps.length=0)');
        return;
      }
      console.log('[HealthCheck] App options:', firebase.app().options);

      const t0 = Date.now();
      await firebase.firestore().collection('__healthcheck').limit(1).get();
      const dt = Date.now() - t0;
      console.log('[HealthCheck] Firestore GET ok in', dt, 'ms');
      showPopup('success', `Terhubung ke Firestore (${dt} ms)`);
    } catch (err) {
      console.warn('[HealthCheck] Firestore error:', err);
      let msg = 'Gagal akses Firestore.';
      if (err && err.code) {
        if (err.code === 'permission-denied') {
          msg = 'Firestore Rules menolak akses (permission-denied). Cek rules.';
        } else if (err.code === 'unavailable') {
          msg = 'Firestore tidak tersedia / jaringan bermasalah (unavailable).';
        } else if (err.code === 'failed-precondition') {
          msg = 'Persistence konflik (multi tab). Tutup tab lain atau matikan persistence.';
        } else {
          msg = `Firestore error: ${err.code}`;
        }
      } else if (err?.message) {
        msg = err.message;
      }
      showPopup('error', msg);
    }

    try {
      const user = firebase.auth().currentUser;
      if (user) {
        console.log('[HealthCheck] Auth OK as', user.email);
      } else {
        console.log('[HealthCheck] Belum login (Auth OK).');
      }
    } catch (e) {
      console.warn('[HealthCheck] Auth check error:', e);
      showPopup('error', 'Auth tidak tersedia.');
    }
  }

  // Tangani hasil signInWithRedirect (popup blocked)
  async function handleRedirectResult() {
    try {
      const result = await auth.getRedirectResult();
      if (result && result.user) {
        showPopup('success', `Terhubung sebagai ${result.user.email}`);
      }
    } catch (err) {
      if (err?.message) showPopup('error', err.message);
    }
  }

  /* ===== UI & Navigation ===== */
  function initUI() {
    const sidebar = $('#sidebar'), scrim = $('#scrim');
    if (!sidebar || !scrim) return;

    const btnOpenNav = $('#btnOpenNav');
    if (btnOpenNav) btnOpenNav.onclick = () => { sidebar.classList.add('open'); scrim.classList.add('show'); };

    scrim.onclick = () => { sidebar.classList.remove('open'); scrim.classList.remove('show'); };

    // Nav click handler dengan route guard
    $$('[data-nav]').forEach(btn => {
      if (!(btn instanceof HTMLElement) || !btn.dataset.nav) return;
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.nav;
        if (!canNavigateTo(targetId)) {
          showPopup('error', 'Akses terbatas untuk akun Pending.');
          return forceTo('dashboard');
        }
        showPage(targetId);
        if (window.innerWidth <= 992) {
          sidebar.classList.remove('open');
          scrim.classList.remove('show');
        }
      });
    });

    // Link cepat antar section
    $$('[data-nav-link]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const navId = (el instanceof HTMLElement) ? el.dataset.navLink : null;
        if (!navId) return;
        if (!canNavigateTo(navId)) {
          showPopup('error', 'Akses terbatas untuk akun Pending.');
          return forceTo('dashboard');
        }
        const targetNavElement = $(`.nav-item[data-nav="${navId}"]`);
        if (targetNavElement instanceof HTMLElement) {
          targetNavElement.click();
          const monitorTarget = (el instanceof HTMLElement) ? el.dataset.monitorTarget : null;
          if (monitorTarget) {
            setTimeout(() => {
              const targetTab = $(`#page-monitoring .tab-btn[data-kategori="${monitorTarget}"]`);
              if (targetTab instanceof HTMLElement) targetTab.click();
            }, 50);
          }
        }
      });
    });

    // Quick link ke form tertentu
    $$('[data-quick-link]').forEach(el => {
      el.addEventListener('click', () => {
        if (!(el instanceof HTMLElement)) return;
        const navId = el.dataset.quickLink;
        const formTarget = el.dataset.formTarget;
        if (!navId) return;
        if (!canNavigateTo(navId)) {
          showPopup('error', 'Akses terbatas untuk akun Pending.');
          return forceTo('dashboard');
        }
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
      });
    });

    // Refresh data
    const btnRefresh = $('#btnRefresh');
    if (btnRefresh) btnRefresh.onclick = (e) => {
      e.stopPropagation();
      attachDataListeners();
    };

    // Tema
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

    // Pencarian global
    const searchBtn = $('#global-search-btn');
    const searchContainer = $('#global-search-container');
    if (searchBtn && searchContainer) {
      searchBtn.onclick = () => {
        searchContainer.classList.toggle('active');
        if (searchContainer.classList.contains('active')) {
          $('#global-search-input')?.focus();
        }
      };
    }

    // User & Notifications dropdown
    const userProfileBtn = $('#user-profile-btn');
    const userDropdown = $('#user-dropdown');
    const notificationBtn = $('#notification-btn');
    const notificationDropdown = $('#notification-dropdown');

    if (userProfileBtn && userDropdown) {
      userProfileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        userDropdown.classList.toggle('show');
      });
    }
    if (notificationBtn && notificationDropdown) {
      notificationBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        notificationDropdown.classList.toggle('show');
      });
    }

    window.addEventListener('click', (e) => {
      const t = e.target;
      if (userDropdown && !userDropdown.contains(t) && userProfileBtn && !userProfileBtn.contains(t)) {
        userDropdown.classList.remove('show');
      }
      if (notificationDropdown && !notificationDropdown.contains(t) && notificationBtn && !notificationBtn.contains(t)) {
        notificationDropdown.classList.remove('show');
      }
    });
  }

  function showPage(id) {
    // Route guard kedua (jaga pemanggilan langsung)
    if (!canNavigateTo(id)) id = 'dashboard';

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

    // Tampilkan/sembunyikan elemen berdasarkan role
    $$('[data-role]').forEach(el => {
      if (!(el instanceof HTMLElement)) return;
      if (isOwner()) {
        el.style.display = ''; // Owner = superuser
        return;
      }
      const roles = el.dataset.role.split(',').map(s => s.trim());
      el.style.display = roles.includes(userRole) ? '' : 'none';
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

    // Contoh listener (ganti sesuai koleksimu)
    const workersRef = db.collection('users').doc(uid).collection('workers');
    const workerListener = workersRef.onSnapshot(
      snapshot => {
        const workers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        populateWorkers(workers);
        showPopup('success', 'Data real-time aktif.');
      },
      err => {
        console.error("Error fetching workers:", err);
        showPopup('error', err?.message || 'Gagal mendengar data (workers).');
      }
    );
    listeners.push(workerListener);
  }

  function detachDataListeners() {
    listeners.forEach(unsub => unsub && unsub());
    listeners = [];
  }

  /* ===== Form/Modal/Monitoring Stubs (isi sesuai kebutuhan) ===== */
  function initForms(){ /* ... */ }
  function initModals(){ /* ... */ }
  function initMonitoring(){ /* ... */ }
  function populateWorkers(_workers){ /* ... */ }

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

  // Sisipkan skeleton halaman agar showPage() selalu punya target
  function injectPageHTML() {
    const container = $('.page-container');
    if (!container) return;
    container.innerHTML += `
      <main id="page-dashboard" class="page active">
        <!-- Dashboard content from index.html -->
      </main>
      <main id="page-input-data" class="page" data-role="Owner,Admin,User,Logistik,Admin Proyek,Koordinator">
        <!-- Input Data page content -->
      </main>
      <main id="page-absensi" class="page" data-role="Owner,Admin,Admin Proyek,User">
        <!-- Absensi page content -->
      </main>
      <main id="page-stok-material" class="page" data-role="Owner,Admin,Logistik">
        <!-- Stok Material page content -->
      </main>
      <main id="page-tagihan" class="page" data-role="Owner,Admin,Koordinator">
        <!-- Tagihan page content -->
      </main>
      <main id="page-monitoring" class="page">
        <!-- Laporan/Monitoring page content (boleh untuk Pending) -->
      </main>
      <main id="page-pengaturan" class="page" data-role="Owner,Admin">
        <!-- Pengaturan page content -->
      </main>
    `;
  }

  // Mulai aplikasi
  init();
});
