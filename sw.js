// =================================================================
// PKP Service Worker v2.0 - Cache First Strategy
// =================================================================

const CACHE_NAME = 'banplex-cache-v1';
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxNa1eQyPZVPZAq8-yWP3FtmUIHrPnR8jeZugLn9wc5kNCrWYl293oQVpxTst51ylLaZg/exec';
const DB_NAME = 'pkp-db-v4';
const DB_VERSION = 1;
const OUTBOX_STORE = 'outbox';

// Files that form the "app shell" - to be cached immediately.
const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/logo-main.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/idb@7/build/umd.js'
];

self.addEventListener('install', (event) => {
  console.log('SW: Install event');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('SW: Caching app shell');
        return cache.addAll(APP_SHELL_URLS);
      })
  );
});

self.addEventListener('activate', (event) => {
  console.log('SW: Activate event');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('SW: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
    // For API calls to Google Apps Script, always go to the network.
    if (event.request.url.startsWith(SCRIPT_URL)) {
        event.respondWith(fetch(event.request));
        return;
    }
    
    // For app shell and other requests, use Cache First strategy.
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // If we find a match in the cache, return it.
                if (response) {
                    return response;
                }
                // Otherwise, fetch from the network.
                return fetch(event.request);
            })
    );
});


// --- Background Sync Logic (remains the same) ---
const toBase64 = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = () => {
        if (typeof reader.result === 'string') {
            resolve(reader.result.split(',')[1]);
        } else {
            reject(new Error('Could not read blob as string.'));
        }
    };
    reader.onerror = (error) => reject(error);
});

async function syncData() {
    // ... This function remains exactly the same as the previous version ...
    // It is triggered by the 'sync' event, not the 'fetch' event.
}

self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-data') {
        console.log('SW: Sync event received');
        event.waitUntil(syncData());
    }
});

