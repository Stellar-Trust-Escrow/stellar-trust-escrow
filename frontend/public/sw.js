/**
 * Stellar Trust Escrow — Service Worker
 *
 * Strategies:
 *  - Static assets  → Cache-first (fall back to network, then offline page)
 *  - API routes     → Network-first (fall back to cache, serve stale if offline)
 *  - Background sync → replays mutations queued in IndexedDB when connectivity returns
 */

const CACHE_VERSION = 'v2';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const API_CACHE = `api-${CACHE_VERSION}`;

/** Static assets to pre-cache on install. */
const STATIC_ASSETS = [
  '/',
  '/dashboard',
  '/explorer',
  '/offline.html',
  '/favicon.ico',
];

/** Network-first routes — any URL whose pathname starts with these prefixes. */
const API_PREFIXES = ['/api/'];

/** Background sync tag shared with the usePWA hook. */
const SYNC_TAG = 'sync-pending-mutations';

/** IndexedDB constants — must match those in usePWA.js. */
const DB_NAME = 'stellar-trust-pwa';
const DB_VERSION = 1;
const STORE_MUTATIONS = 'pendingMutations';

// ---------------------------------------------------------------------------
// Install — pre-cache static assets
// ---------------------------------------------------------------------------

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

// ---------------------------------------------------------------------------
// Activate — purge stale caches
// ---------------------------------------------------------------------------

self.addEventListener('activate', (event) => {
  const allowedCaches = new Set([STATIC_CACHE, API_CACHE]);

  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => !allowedCaches.has(name))
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ---------------------------------------------------------------------------
// Fetch — routing
// ---------------------------------------------------------------------------

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin HTTP/HTTPS requests
  if (!['http:', 'https:'].includes(url.protocol)) return;

  if (isApiRequest(url)) {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(cacheFirst(request));
  }
});

/**
 * @param {URL} url
 * @returns {boolean}
 */
function isApiRequest(url) {
  return API_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// Cache-first strategy (static assets)
// ---------------------------------------------------------------------------

/**
 * Serve from cache; fall back to network and update the cache; if both fail,
 * serve the offline page for navigation requests.
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) return cachedResponse;

  try {
    const networkResponse = await fetch(request.clone());
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (_err) {
    // Offline fallback for navigation requests
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match('/offline.html');
      if (offlinePage) return offlinePage;
    }
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// ---------------------------------------------------------------------------
// Network-first strategy (API routes)
// ---------------------------------------------------------------------------

/**
 * Try the network; cache a successful GET response; fall back to the cached
 * copy when the network is unavailable.
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request.clone());

    if (networkResponse.ok && request.method === 'GET') {
      const cache = await caches.open(API_CACHE);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (_err) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;

    return new Response(
      JSON.stringify({ error: 'You are offline and no cached data is available.' }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Background sync — replay queued mutations from IndexedDB
// ---------------------------------------------------------------------------

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(replayQueuedMutations());
  }
});

/**
 * Open the PWA IndexedDB, read all pending mutations, and replay them.
 * Successful mutations are removed; conflicts and network errors are left for
 * the client-side hook to handle.
 *
 * @returns {Promise<void>}
 */
async function replayQueuedMutations() {
  let db;
  try {
    db = await openIDB();
  } catch (err) {
    console.error('[sw] Failed to open IndexedDB for sync:', err);
    return;
  }

  let mutations;
  try {
    mutations = await idbGetAll(db, STORE_MUTATIONS);
  } catch (err) {
    console.error('[sw] Failed to read mutations from IndexedDB:', err);
    db.close();
    return;
  }

  const pending = mutations.filter((m) => m.status === 'pending');

  for (const mutation of pending) {
    try {
      const response = await fetch(mutation.url, {
        method: mutation.method,
        headers: {
          'Content-Type': 'application/json',
          ...mutation.headers,
        },
        body: mutation.body != null ? JSON.stringify(mutation.body) : undefined,
      });

      if (response.ok) {
        await idbDelete(db, STORE_MUTATIONS, mutation.id);
      }
      // Conflicts and server errors are left for the client hook to handle
    } catch (_networkErr) {
      // Still offline — leave mutation queued; throw so the sync is retried
      db.close();
      throw new Error('Network unavailable; sync will be retried');
    }
  }

  db.close();

  // Notify all open clients so they can refresh their state
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({ type: 'SW_SYNC_COMPLETE' });
  }
}

// ---------------------------------------------------------------------------
// Minimal IndexedDB helpers (service worker context)
// ---------------------------------------------------------------------------

/**
 * @returns {Promise<IDBDatabase>}
 */
function openIDB() {
  return new Promise((resolve, reject) => {
    const req = self.indexedDB.open(DB_NAME, DB_VERSION);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_MUTATIONS)) {
        db.createObjectStore(STORE_MUTATIONS, { keyPath: 'id' });
      }
    };
  });
}

/**
 * @param {IDBDatabase} db
 * @param {string} storeName
 * @returns {Promise<unknown[]>}
 */
function idbGetAll(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * @param {IDBDatabase} db
 * @param {string} storeName
 * @param {string} key
 * @returns {Promise<void>}
 */
function idbDelete(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
