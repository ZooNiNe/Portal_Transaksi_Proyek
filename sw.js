const CACHE_NAME = 'pkp-cache-v1';
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwLn3bi3DxH4T4rBouQdnXbSnfR6KF2dviiL2lEWAzHZb0h6ABOzne0K3k7RClckJJQ/exec';
const DB_NAME = 'pkp-db-v4';
const DB_VERSION = 1;
const OUTBOX_STORE = 'outbox';

// A simple helper to open the database.
function openDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

// Another helper to convert blobs to base64.
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
    console.log('Service Worker: Starting sync...');
    const db = await openDb();
    const tx = db.transaction(OUTBOX_STORE, 'readwrite');
    const store = tx.objectStore(OUTBOX_STORE);
    const items = await store.getAll();

    if (items.length === 0) {
        console.log('Service Worker: No items to sync.');
        return;
    }

    try {
        for (const item of items) {
            const body = { ...item.payload };
            if (body.files && body.files.length > 0) {
                body.files = await Promise.all(body.files.map(async (f) => ({
                    name: f.name,
                    type: f.type,
                    base64: await toBase64(f.blob)
                })));
            }
            
            // REVISION: Removed 'no-cors' to allow proper response handling.
            // This requires the backend (kode.gs) to be updated with CORS headers.
            const response = await fetch(SCRIPT_URL, {
                method: 'POST',
                body: JSON.stringify(body),
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                // The 'redirect' option is removed as we expect a direct JSON response now.
            });

            if (response.ok) {
                console.log('Service Worker: Synced item', item.id);
                await store.delete(item.id);
            } else {
                // If the server responds with an error, stop and retry later.
                console.error('Service Worker: Sync failed for item', item.id, response.statusText);
                throw new Error('Server error during sync');
            }
        }
        console.log('Service Worker: Sync complete.');
    } catch (error) {
        console.error('Service Worker: Sync process failed.', error);
        // Do not clear the outbox, the sync will be retried later.
        throw error; // Important to throw error to let the SyncManager know it failed.
    }
}

self.addEventListener('install', (event) => {
    console.log('Service Worker: Installing...');
    // Caching app shell can be added here if needed
});

self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activating...');
});

self.addEventListener('fetch', (event) => {
    // A simple pass-through fetch handler. Caching strategies can be added here.
    event.respondWith(fetch(event.request));
});

self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-data') {
        console.log('Service Worker: Sync event received');
        event.waitUntil(syncData());
    }
});

