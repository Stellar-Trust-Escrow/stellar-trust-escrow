'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ---------------------------------------------------------------------------
// IndexedDB helpers — no external library
// ---------------------------------------------------------------------------

const DB_NAME = 'stellar-trust-pwa';
const DB_VERSION = 1;
const STORE_MUTATIONS = 'pendingMutations';
const STORE_CONFLICTS = 'conflicts';

/**
 * Open (and initialise) the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORE_MUTATIONS)) {
        const mutationStore = db.createObjectStore(STORE_MUTATIONS, {
          keyPath: 'id',
          autoIncrement: false,
        });
        mutationStore.createIndex('by_createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_CONFLICTS)) {
        const conflictStore = db.createObjectStore(STORE_CONFLICTS, {
          keyPath: 'mutationId',
        });
        conflictStore.createIndex('by_resolvedAt', 'resolvedAt', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Read all records from an object store.
 * @param {IDBDatabase} db
 * @param {string} storeName
 * @returns {Promise<unknown[]>}
 */
function readAll(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Write a single record to an object store (put = upsert).
 * @param {IDBDatabase} db
 * @param {string} storeName
 * @param {unknown} record
 * @returns {Promise<void>}
 */
function write(db, storeName, record) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Delete a single record by key from an object store.
 * @param {IDBDatabase} db
 * @param {string} storeName
 * @param {string} key
 * @returns {Promise<void>}
 */
function remove(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} PendingMutation
 * @property {string}  id          UUID for this mutation.
 * @property {string}  url         Absolute URL to replay the request to.
 * @property {string}  method      HTTP method (POST, PUT, PATCH, DELETE).
 * @property {unknown} body        JSON-serialisable request body.
 * @property {Record<string,string>} [headers]  Extra request headers.
 * @property {number}  createdAt   Unix timestamp (ms) when the mutation was queued.
 * @property {'pending'|'replaying'|'conflict'|'done'} status
 */

/**
 * @typedef {Object} ConflictResolution
 * @property {'local'|'server'|'merge'} strategy
 * @property {unknown} [mergedBody]  Required when strategy === 'merge'.
 */

/**
 * @typedef {Object} PWAState
 * @property {boolean}  isInstallable        True when the install prompt is available.
 * @property {Function} install              Triggers the native install prompt.
 * @property {boolean}  isOffline            True when the device has no network.
 * @property {Function} queueMutation        Save a mutation to IDB for offline replay.
 * @property {Function} syncPendingMutations Replay all queued mutations now.
 * @property {number}   conflictCount        Number of mutations in conflict state.
 * @property {Function} resolveConflict      Mark a conflict resolved.
 */

/**
 * React hook providing offline-first PWA capabilities:
 * install prompt handling, online/offline detection, and an IndexedDB-backed
 * mutation queue with conflict resolution.
 *
 * @returns {PWAState}
 */
export function usePWA() {
  const [isInstallable, setIsInstallable] = useState(false);
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );
  const [conflictCount, setConflictCount] = useState(0);

  /** @type {React.MutableRefObject<BeforeInstallPromptEvent|null>} */
  const installPromptRef = useRef(null);

  /** @type {React.MutableRefObject<IDBDatabase|null>} */
  const dbRef = useRef(null);

  // -------------------------------------------------------------------------
  // Open IndexedDB on mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return;

    openDB()
      .then((db) => {
        dbRef.current = db;
        // Count initial conflicts
        return readAll(db, STORE_CONFLICTS);
      })
      .then((conflicts) => {
        const unresolved = conflicts.filter((c) => !c.resolvedAt);
        setConflictCount(unresolved.length);
      })
      .catch((err) => {
        console.error('[usePWA] Failed to open IndexedDB:', err);
      });

    return () => {
      dbRef.current?.close();
      dbRef.current = null;
    };
  }, []);

  // -------------------------------------------------------------------------
  // Install prompt
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      installPromptRef.current = event;
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      installPromptRef.current = null;
      setIsInstallable(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Online / offline detection
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Auto-sync when coming back online
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isOffline && dbRef.current) {
      syncPendingMutations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOffline]);

  // -------------------------------------------------------------------------
  // Public functions
  // -------------------------------------------------------------------------

  /**
   * Trigger the deferred PWA install prompt.
   * @returns {Promise<void>}
   */
  const install = useCallback(async () => {
    if (!installPromptRef.current) return;

    await installPromptRef.current.prompt();
    const { outcome } = await installPromptRef.current.userChoice;

    if (outcome === 'accepted') {
      installPromptRef.current = null;
      setIsInstallable(false);
    }
  }, []);

  /**
   * Persist a mutation to IndexedDB so it can be replayed when the device is
   * back online.
   *
   * @param {{ url: string, method: string, body: unknown, headers?: Record<string,string> }} mutation
   * @returns {Promise<string>}  The assigned mutation ID.
   */
  const queueMutation = useCallback(async (mutation) => {
    if (!dbRef.current) throw new Error('[usePWA] IndexedDB not ready');

    /** @type {PendingMutation} */
    const record = {
      id: `mut-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      url: mutation.url,
      method: (mutation.method || 'POST').toUpperCase(),
      body: mutation.body ?? null,
      headers: mutation.headers || {},
      createdAt: Date.now(),
      status: 'pending',
    };

    await write(dbRef.current, STORE_MUTATIONS, record);

    // Register for background sync if the service worker supports it
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      const registration = await navigator.serviceWorker.ready;
      await registration.sync.register('sync-pending-mutations');
    }

    return record.id;
  }, []);

  /**
   * Replay all queued mutations against their original endpoints.
   * Mutations that receive a 409 Conflict are moved to the conflicts store.
   *
   * @returns {Promise<void>}
   */
  const syncPendingMutations = useCallback(async () => {
    if (!dbRef.current) return;

    let mutations;
    try {
      mutations = await readAll(dbRef.current, STORE_MUTATIONS);
    } catch (err) {
      console.error('[usePWA] Failed to read pending mutations:', err);
      return;
    }

    const pending = mutations.filter((m) => m.status === 'pending');
    if (!pending.length) return;

    let newConflicts = 0;

    for (const mutation of pending) {
      // Mark as replaying
      await write(dbRef.current, STORE_MUTATIONS, { ...mutation, status: 'replaying' }).catch(() => {});

      try {
        const response = await fetch(mutation.url, {
          method: mutation.method,
          headers: {
            'Content-Type': 'application/json',
            ...mutation.headers,
          },
          body: mutation.body != null ? JSON.stringify(mutation.body) : undefined,
        });

        if (response.status === 409) {
          // Conflict — persist for manual resolution
          await write(dbRef.current, STORE_MUTATIONS, { ...mutation, status: 'conflict' }).catch(() => {});
          await write(dbRef.current, STORE_CONFLICTS, {
            mutationId: mutation.id,
            mutation,
            serverResponseStatus: response.status,
            detectedAt: Date.now(),
            resolvedAt: null,
          }).catch(() => {});
          newConflicts++;
        } else if (response.ok) {
          await remove(dbRef.current, STORE_MUTATIONS, mutation.id).catch(() => {});
        } else {
          // Non-conflict server error — revert to pending for retry
          await write(dbRef.current, STORE_MUTATIONS, { ...mutation, status: 'pending' }).catch(() => {});
        }
      } catch (networkErr) {
        // Network still down — revert to pending
        await write(dbRef.current, STORE_MUTATIONS, { ...mutation, status: 'pending' }).catch(() => {});
      }
    }

    if (newConflicts > 0) {
      setConflictCount((prev) => prev + newConflicts);
    }
  }, []);

  /**
   * Mark a conflict as resolved and optionally replay the mutation with the
   * chosen resolution strategy.
   *
   * @param {string} mutationId
   * @param {ConflictResolution} resolution
   * @returns {Promise<void>}
   */
  const resolveConflict = useCallback(
    async (mutationId, resolution) => {
      if (!dbRef.current) throw new Error('[usePWA] IndexedDB not ready');

      const mutations = await readAll(dbRef.current, STORE_MUTATIONS);
      const mutation = mutations.find((m) => m.id === mutationId);

      if (!mutation) throw new Error(`Mutation not found: ${mutationId}`);

      if (resolution.strategy === 'server') {
        // Discard local change — delete mutation and conflict
        await remove(dbRef.current, STORE_MUTATIONS, mutationId);
      } else if (resolution.strategy === 'local') {
        // Force-replay the local mutation, ignoring the conflict
        await write(dbRef.current, STORE_MUTATIONS, { ...mutation, status: 'pending' });
        await syncPendingMutations();
      } else if (resolution.strategy === 'merge') {
        if (resolution.mergedBody == null) {
          throw new Error("resolution.mergedBody is required when strategy is 'merge'");
        }
        const merged = { ...mutation, body: resolution.mergedBody, status: 'pending' };
        await write(dbRef.current, STORE_MUTATIONS, merged);
        await syncPendingMutations();
      }

      // Mark conflict record resolved
      const conflicts = await readAll(dbRef.current, STORE_CONFLICTS);
      const conflict = conflicts.find((c) => c.mutationId === mutationId);
      if (conflict) {
        await write(dbRef.current, STORE_CONFLICTS, {
          ...conflict,
          resolvedAt: Date.now(),
        });
      }

      // Recalculate conflict count
      const allConflicts = await readAll(dbRef.current, STORE_CONFLICTS);
      const unresolvedCount = allConflicts.filter((c) => !c.resolvedAt).length;
      setConflictCount(unresolvedCount);
    },
    [syncPendingMutations],
  );

  return {
    isInstallable,
    install,
    isOffline,
    queueMutation,
    syncPendingMutations,
    conflictCount,
    resolveConflict,
  };
}

export default usePWA;
