// @ts-check
/* =======================================================
 * PKP Frontend — v4.2 (Payment Hub + Approval Center + Export)
 * REVISI: Migrasi ke Firebase v9+ Modular SDK
 * ======================================================= */

// PERUBAHAN (v9): Impor fungsi yang dibutuhkan dari SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { 
    getAuth, 
    setPersistence, 
    browserLocalPersistence, 
    onAuthStateChanged, 
    GoogleAuthProvider, 
    signInWithPopup, 
    signInWithRedirect, 
    getRedirectResult,
    signOut
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { 
    getFirestore, 
    enableIndexedDbPersistence, 
    collection, 
    doc, 
    getDoc,
    setDoc,
    updateDoc,
    onSnapshot,
    serverTimestamp,
    query,
    where,
    limit,
    orderBy,
    runTransaction,
    writeBatch,
    getDocs
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const OWNER_EMAIL = 'dq060412@gmail.com';
    const TEAM_ID = 'main';
  
    // ===== FIREBASE CONFIG (Tetap sama) =====
    const firebaseConfig = {
      apiKey: "AIzaSyBDTURKKzmhG8hZXlBryoQRdjqd70GI18c",
      authDomain: "banflex-3e7c4.firebaseapp.com",
      projectId: "banflex-3e7c4",
      storageBucket: "banflex-3e7c4.appspot.com",
      messagingSenderId: "192219628345",
      appId: "1:192219628345:web:f1caa28230a5803e681ee8"
    };
  
    // ===== PERUBAHAN (v9): Inisialisasi Firebase =====
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const auth = getAuth(app);
    
    // Aktifkan persistence (sedikit berbeda di v9)
    enableIndexedDbPersistence(db).catch((err) => console.error("Firestore persistence failed: ", err));
    setPersistence(auth, browserLocalPersistence).catch((err) => console.error("Auth persistence failed: ", err));

    // ===== State =====
    let currentUser = null;
    let userRole = 'Guest';
    let roleUnsub = null; // Firestore listener
  
    // ===== PERUBAHAN (v9): Refs (sedikit berbeda) =====
    const teamRef = doc(db, 'teams', TEAM_ID);
    const membersCol = collection(teamRef, 'members');
    const projectsCol = collection(teamRef, 'projects');
    const envelopesCol = collection(teamRef, 'fund_envelopes');
    const payablesCol = collection(teamRef, 'payables');
    const entriesCol = collection(teamRef, 'entries');
    const workersCol = collection(teamRef, 'workers');
    const attendanceCol = collection(teamRef, 'attendance');
    const changeRequestsCol = collection(teamRef, 'change_requests');
  
    // ===== Helpers (Tidak berubah) =====
    const $  = (s) => document.querySelector(s);
    const $$ = (s) => Array.from(document.querySelectorAll(s));
    const fmtIDR = (n)=> new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0}).format(Number(n||0));
    const todayStr = ()=> new Date().toISOString().slice(0,10);
    const asNum = (v)=> Number(String(v ?? 0).toString().replace(/[^\d.-]/g,'')||0);
    const isMobileLike = () => /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;
    const lockScroll = (lock) => document.body.classList.toggle('modal-open', !!lock);

    // Toast (Tidak berubah)
    let popupTimeout;
    function toast(kind, text){
      clearTimeout(popupTimeout);
      const p = $('#popup-container'); if(!p) return;
      p.className = 'popup-container show popup-' + kind;
      const iconEl = $('#popup-icon'); const messageEl = $('#popup-message');
      if(iconEl && messageEl){
        iconEl.className = kind === 'loading' ? 'spinner' : 'material-symbols-outlined';
        iconEl.textContent = kind === 'success' ? 'check_circle' : (kind === 'error' ? 'cancel' : '');
        messageEl.textContent = text;
      }
      if(kind !== 'loading'){
        popupTimeout = setTimeout(() => p.classList.remove('show'), 2800);
      }
    }

    // Fungsi UI lainnya (tidak berubah)
    function setConnectionDot(color){ 
      const dot = $('#connection-status .status-dot'); if(!dot) return;
      dot.className = 'status-dot'; // Reset classes
      dot.classList.add(color === 'green' ? 'online' : color === 'yellow' ? 'pending' : 'offline');
    }

    // --- LOGIKA UTAMA APLIKASI ---
    wireUI();
    ensurePagesInjected();
    showPage('dashboard');
    reflectGuestPlaceholder('dashboard');

    function wireUI(){
      const sidebar = $('#sidebar'), scrim = $('#scrim');
      $('#btnOpenNav')?.addEventListener('click', ()=>{ sidebar?.classList.add('open'); scrim?.classList.add('show'); });
      scrim?.addEventListener('click', ()=>{ sidebar?.classList.remove('open'); scrim?.classList.remove('show'); });
  
      if(localStorage.getItem('theme') === 'dark') document.body.classList.add('dark-theme');
      $('#theme-toggle-btn')?.addEventListener('click', ()=>{
        document.body.classList.toggle('dark-theme');
        localStorage.setItem('theme', document.body.classList.contains('dark-theme') ? 'dark':'light');
      });
  
      const userBtn = $('#user-profile-btn'), userDd = $('#user-dropdown');
      userBtn?.addEventListener('click', (e)=>{ e.stopPropagation(); userDd?.classList.toggle('hidden'); });
      window.addEventListener('click', (e)=>{ if(userDd && !userDd.contains(e.target) && userBtn && !userBtn.contains(e.target)) userDd.classList.add('hidden'); });
  
      // --- PERUBAHAN: Logika Tombol Auth ---
      const handleAuthClick = () => {
        if(currentUser) {
            signOut(auth).catch(err => toast('error', 'Gagal keluar: ' + err.message));
        } else {
            openLoginModal();
        }
      };
      $('#auth-btn')?.addEventListener('click', handleAuthClick);
      $('#auth-dropdown-btn')?.addEventListener('click', () => {
        $('#user-dropdown')?.classList.add('hidden');
        handleAuthClick();
      });

      // --- PERUBAHAN: Event listener untuk tombol Google dan tutup modal ---
      $('#google-login-btn')?.addEventListener('click', signInWithGoogle);
      $('#close-login-modal-btn')?.addEventListener('click', () => {
        $('#login-modal')?.classList.add('hidden');
        lockScroll(false);
      });
  
      $$('[data-nav]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const id = btn.getAttribute('data-nav');
          showPage(id);
          reflectGuestPlaceholder(id);
          renderIfNeeded(id);
          sidebar?.classList.remove('open'); 
          scrim?.classList.remove('show');
        });
      });
  
      document.body.addEventListener('click', (e)=>{
        const t = e.target;
        if(t?.matches?.('.modal-bg')){ t.classList.add('hidden'); lockScroll(false); }
      });
    }

    function openLoginModal(){
      $('#login-modal')?.classList.remove('hidden');
      lockScroll(true);
    }
    
    // --- PERUBAHAN (v9): Logika Otentikasi ---

    // Cek jika halaman dibuka dari file://
    if (window.location.protocol === 'file:') {
        console.warn('Firebase Auth tidak mendukung protokol file://. Silakan jalankan melalui server lokal (HTTP/HTTPS).');
        toast('error', 'Aplikasi harus diakses via HTTP/HTTPS.');
        document.addEventListener('DOMContentLoaded', () => {
            const loginBtn = document.getElementById('google-login-btn');
            if(loginBtn) loginBtn.disabled = true;
        });
    }
    
    // Fungsi login dengan Google
    async function signInWithGoogle() {
        const provider = new GoogleAuthProvider();
        toast('loading', 'Menghubungkan ke Google...');
        try {
            if (isMobileLike()) {
                // Untuk mobile, lebih baik pakai redirect
                await signInWithRedirect(auth, provider);
            } else {
                // Untuk desktop, pakai popup
                await signInWithPopup(auth, provider);
                toast('success', 'Login berhasil!');
                $('#login-modal')?.classList.add('hidden');
                lockScroll(false);
            }
        } catch (error) {
            toast('error', mapAuthError(error));
        }
    }

    // Handle hasil redirect (setelah kembali dari halaman login Google)
    getRedirectResult(auth)
      .then((result) => {
        if (result) {
            // Berhasil login via redirect
            toast('success', 'Login berhasil!');
            $('#login-modal')?.classList.add('hidden');
            lockScroll(false);
        }
      }).catch((error) => {
        toast('error', mapAuthError(error));
      });

    // Pesan error yang lebih mudah dipahami
    function mapAuthError(e){
      const code = e?.code || '';
      if (code.includes('network')) return 'Jaringan bermasalah. Coba lagi.';
      if (code.includes('auth/popup-blocked')) return 'Popup diblokir. Izinkan popup untuk situs ini.';
      if (code.includes('auth/cancelled-popup-request') || code.includes('auth/popup-closed-by-user')) return 'Login dibatalkan.';
      return e?.message || 'Login gagal. Terjadi kesalahan.';
    }

    // --- PERUBAHAN (v9): Listener Status Otentikasi ---
    onAuthStateChanged(auth, async (user) => {
        if (roleUnsub) {
            roleUnsub(); // Hentikan listener lama
            roleUnsub = null;
        }

        if (user) {
            // --- USER LOGIN ---
            currentUser = user;
            
            await ensureMemberDoc(user); // Pastikan dokumen member ada
            
            const userDocRef = doc(membersCol, user.uid);
            
            // Dengar perubahan role secara realtime
            roleUnsub = onSnapshot(userDocRef, async (snap) => {
                const data = snap.data() || {};
                userRole = data.role || 'Pending';

                if ((user.email || '').toLowerCase() === OWNER_EMAIL && userRole !== 'Owner') {
                    await updateDoc(userDocRef, {
                        role: 'Owner',
                        updatedAt: serverTimestamp()
                    });
                    userRole = 'Owner';
                }

                updateHeaderForUser(user);
                setConnectionDot(userRole === 'Pending' ? 'yellow' : 'green');
                applyRoleVisibility();
                
                const activePage = document.querySelector('.page.active')?.id?.replace('page-','') || 'dashboard';
                renderIfNeeded(activePage);

            }, (error) => {
                console.warn('Role listener error:', error);
                setConnectionDot('yellow');
            });

        } else {
            // --- USER LOGOUT ---
            currentUser = null;
            userRole = 'Guest';
            updateHeaderForUser(null);
            setConnectionDot('red');
            setNotifDot(0);
            applyRoleVisibility();
        }
    });

    // Fungsi untuk memastikan dokumen member ada di Firestore
    async function ensureMemberDoc(user) {
        const userDocRef = doc(membersCol, user.uid);
        const docSnap = await getDoc(userDocRef);
        if (!docSnap.exists()) {
            await setDoc(userDocRef, {
                email: user.email,
                name: user.displayName,
                role: (user.email || '').toLowerCase() === OWNER_EMAIL ? 'Owner' : 'Pending',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        }
    }

    // --- FUNGSI-FUNGSI UI (disalin dari file asli, tidak perlu diubah mendalam) ---
    // Cukup pastikan referensi `currentUser`, `userRole`, dan pemanggilan Firestore (jika ada) sudah benar.

    function applyRoleVisibility() {
        document.body.dataset.role = userRole; 
      
        document.querySelectorAll('[data-role]').forEach(el => {
          const roles = String(el.getAttribute('data-role') || '').split(',').map(s => s.trim());
          el.style.display = (roles.includes(userRole) || userRole === 'Owner') ? '' : 'none';
        });
      
        const active = document.querySelector('.page.active')?.id?.replace('page-','') || 'dashboard';
        if (!currentUser || userRole === 'Pending') {
          reflectGuestPlaceholder(active);
        } else {
          const zone = document.querySelector(`#page-${active} .data-zone`);
          if (zone && zone.firstElementChild?.classList.contains('placeholder-card')) {
            zone.innerHTML = ''; 
          }
        }
      
        const authBtn = document.getElementById('auth-btn');
        if (authBtn) {
          const textSpan = authBtn.querySelector('.nav-text');
          const iconSpan = authBtn.querySelector('.material-symbols-outlined');
          if (currentUser) {
            textSpan && (textSpan.textContent = 'Keluar');
            iconSpan && (iconSpan.textContent = 'logout');
            authBtn.classList.add('danger');
          } else {
            textSpan && (textSpan.textContent = 'Login');
            iconSpan && (iconSpan.textContent = 'login');
            authBtn.classList.remove('danger');
          }
        }
    }
    
    function ensurePagesInjected(){
      const container = document.querySelector('.page-container'); if(!container) return;
      if(container.querySelector('#page-dashboard')) return;
      container.innerHTML = `
        <main id="page-dashboard" class="page active"><div class="data-zone"></div></main>
        <main id="page-input-data" class="page"><div class="data-zone"></div></main>
        <main id="page-absensi" class="page"><div class="data-zone"></div></main>
        <main id="page-stok-material" class="page"><div class="data-zone"></div></main>
        <main id="page-tagihan" class="page"><div class="data-zone"></div></main>
        <main id="page-monitoring" class="page"><div class="data-zone"></div></main>
        <main id="page-pengaturan" class="page"><div class="data-zone"></div></main>
      `;
    }
  
    function showPage(id){
      $$('.page').forEach(p=>p.classList.remove('active'));
      $(`#page-${id}`)?.classList.add('active');
      $$('.nav-item.active').forEach(el=>el.classList.remove('active'));
      $(`.nav-item[data-nav="${id}"]`)?.classList.add('active');
    }
  
    function reflectGuestPlaceholder(id){
      const container = $(`#page-${id}`); if(!container) return;
      let zone = container.querySelector('.data-zone');
      if(!zone){ zone = document.createElement('div'); zone.className = 'data-zone'; container.appendChild(zone); }
      if(!currentUser || userRole==='Pending'){
        zone.innerHTML = `
          <div class="card placeholder-card">
            <div class="placeholder-title">Mode Tamu</div>
            <div class="placeholder-desc">Data tidak ditampilkan. Silakan login untuk melihat data.</div>
            <button class="btn btn-primary" id="placeholder-login">Login</button>
          </div>`;
        $('#placeholder-login')?.addEventListener('click', openLoginModal);
      } else {
        if(zone.querySelector('.placeholder-card')) { 
            zone.innerHTML=''; 
        }
      }
    }
  
    function updateHeaderForUser(user){
      const avatar=$('#user-avatar'), dAva=$('#user-dropdown-avatar'), dName=$('#user-dropdown-name'), dEmail=$('#user-dropdown-email');
      const authDropdownBtn = $('#auth-dropdown-btn');
      const authDropdownText = authDropdownBtn?.querySelector('span:not(.material-symbols-outlined)');
      const authDropdownIcon = authDropdownBtn?.querySelector('.material-symbols-outlined');

      if(user){
        const photo=user.photoURL||`https://placehold.co/40x40/3b82f6/ffffff?text=${(user.displayName||'U')[0]}`;
        avatar?.setAttribute('src',photo); dAva?.setAttribute('src',photo.replace('40x40','60x60'));
        if(dName) dName.textContent=user.displayName||'User';
        if(dEmail) dEmail.textContent=user.email||'';
        if (authDropdownText) authDropdownText.textContent = 'Keluar';
        if (authDropdownIcon) authDropdownIcon.textContent = 'logout';
        authDropdownBtn?.classList.replace('btn-secondary', 'btn-danger');

      }else{
        avatar?.setAttribute('src','https://placehold.co/40x40/e2e8f0/64748b?text=G'); dAva?.setAttribute('src','https://placehold.co/60x60/e2e8f0/64748b?text=G');
        if(dName) dName.textContent='Guest'; if(dEmail) dEmail.textContent='Belum login';
        if (authDropdownText) authDropdownText.textContent = 'Login dengan Google';
        if (authDropdownIcon) authDropdownIcon.textContent = 'login';
        authDropdownBtn?.classList.replace('btn-danger', 'btn-secondary');
      }
    }
  
    function setNotifDot(n){
      const badge = $('.notification-badge'); if(!badge) return;
      badge.classList.toggle('hidden', !(n>0));
    }

    async function renderIfNeeded(id) {
        if (userRole === 'Guest' || userRole === 'Pending') {
            reflectGuestPlaceholder(id);
            return;
        }
        // Contoh:
        if(id === 'dashboard') {
            const zone = $('#page-dashboard .data-zone');
            if(zone) zone.innerHTML = '<div class="card card-pad">Selamat datang! Anda sudah login. Fitur lain akan dirender di sini.</div>';
        }
        if(id === 'tagihan') {
            const zone = $('#page-tagihan .data-zone');
            if(zone) zone.innerHTML = '<div class="card card-pad">Halaman Tagihan.</div>';
        }
        // ... Tambahkan logika render untuk halaman lain di sini
    }

});
