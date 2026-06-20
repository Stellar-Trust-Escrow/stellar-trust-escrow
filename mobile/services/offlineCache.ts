import * as SQLite from 'expo-sqlite';
import { AppState, type AppStateStatus } from 'react-native';

const db = SQLite.openDatabaseSync('escrow_cache.db');

const CACHE_VERSION = 1;

const CACHE_TTL_MS: Record<string, number> = {
  escrow: 5 * 60 * 1000,
  milestone: 2 * 60 * 1000,
  reputation: 30 * 60 * 1000,
};

const DEFAULT_TTL_MS = 5 * 60 * 1000;

function getTTL(entityType: string): number {
  return CACHE_TTL_MS[entityType] ?? DEFAULT_TTL_MS;
}

function initCacheDb(): void {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS cache_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const row = db.getFirstSync<{ value: string }>(
    'SELECT value FROM cache_meta WHERE key = ?',
    ['schema_version']
  );

  const storedVersion = row ? parseInt(row.value, 10) : 0;

  if (storedVersion < CACHE_VERSION) {
    db.execSync('DROP TABLE IF EXISTS escrow_cache');
    db.execSync(
      `INSERT OR REPLACE INTO cache_meta (key, value) VALUES ('schema_version', '${CACHE_VERSION}')`
    );
  }

  db.execSync(`
    CREATE TABLE IF NOT EXISTS escrow_cache (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      entity_type TEXT NOT NULL DEFAULT 'escrow',
/**
 * Offline Cache Service
 *
 * Persists escrow data to SQLite so the app remains usable without a network
 * connection. The cache is invalidated when the app comes back online.
 */

import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('ste_offline.db');

export function initOfflineDb(): void {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS escrows (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      cached_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS milestones (
      id INTEGER PRIMARY KEY,
      escrow_id TEXT NOT NULL,
      data TEXT NOT NULL,
      cached_at INTEGER NOT NULL
    );
  `);
}

initCacheDb();

export interface Escrow {
  id: string;
  status: string;
  [key: string]: unknown;
}

export function cacheEscrow(escrow: Escrow, entityType = 'escrow'): void {
  db.runSync(
    'INSERT OR REPLACE INTO escrow_cache (id, data, entity_type, cached_at) VALUES (?, ?, ?, ?)',
    [escrow.id, JSON.stringify(escrow), entityType, Date.now()]
  );
}

export function getCachedEscrow(id: string, entityType = 'escrow'): Escrow | null {
  const row = db.getFirstSync<{ data: string; cached_at: number }>(
    'SELECT data, cached_at FROM escrow_cache WHERE id = ?',
    [id]
  );

  if (!row) return null;

  if (Date.now() - row.cached_at > getTTL(entityType)) {
    db.runSync('DELETE FROM escrow_cache WHERE id = ?', [id]);
    return null;
  }

  try {
    return JSON.parse(row.data) as Escrow;
  } catch {
    db.runSync('DELETE FROM escrow_cache WHERE id = ?', [id]);
    console.warn(`Corrupted cache entry deleted: id=${id}`);
    return null;
  }
}

export function getCachedEscrows(entityType = 'escrow'): Escrow[] {
  const ttl = getTTL(entityType);
  const cutoff = Date.now() - ttl;

  db.runSync('DELETE FROM escrow_cache WHERE entity_type = ? AND cached_at <= ?', [
    entityType,
    cutoff,
  ]);

  const rows = db.getAllSync<{ id: string; data: string }>(
    'SELECT id, data FROM escrow_cache WHERE entity_type = ?',
    [entityType]
  );

  const results: Escrow[] = [];
  const corruptedIds: string[] = [];

  for (const row of rows) {
    try {
      results.push(JSON.parse(row.data) as Escrow);
    } catch {
      corruptedIds.push(row.id);
    }
  }

  if (corruptedIds.length > 0) {
    const placeholders = corruptedIds.map(() => '?').join(',');
    db.runSync(`DELETE FROM escrow_cache WHERE id IN (${placeholders})`, corruptedIds);
    console.warn(`Deleted ${corruptedIds.length} corrupted cache entries`);
  }

  return results;
}

export function pruneStaleCache(): void {
  const now = Date.now();
  for (const [entityType, ttl] of Object.entries(CACHE_TTL_MS)) {
    db.runSync('DELETE FROM escrow_cache WHERE entity_type = ? AND cached_at <= ?', [
      entityType,
      now - ttl,
    ]);
  }
  db.runSync('DELETE FROM escrow_cache WHERE cached_at <= ?', [now - DEFAULT_TTL_MS]);
}

let appStateSubscription: { remove: () => void } | null = null;

export function startCacheCleanupListener(): void {
  if (appStateSubscription) return;

  appStateSubscription = AppState.addEventListener(
    'change',
    (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        pruneStaleCache();
      }
    }
  );
}

export function stopCacheCleanupListener(): void {
  appStateSubscription?.remove();
  appStateSubscription = null;
}

export function clearAllCache(): void {
  db.runSync('DELETE FROM escrow_cache');
}

export function invalidateCacheVersion(): void {
  db.execSync('DROP TABLE IF EXISTS escrow_cache');
  db.execSync(
    `INSERT OR REPLACE INTO cache_meta (key, value) VALUES ('schema_version', '${CACHE_VERSION}')`
  );
  initCacheDb();
export function cacheEscrow(escrow: Record<string, unknown>): void {
  db.runSync(`INSERT OR REPLACE INTO escrows (id, data, cached_at) VALUES (?, ?, ?)`, [
    String(escrow.id),
    JSON.stringify(escrow),
    Date.now(),
  ]);
}

export function getCachedEscrow(id: string): Record<string, unknown> | null {
  const row = db.getFirstSync<{ data: string }>(`SELECT data FROM escrows WHERE id = ?`, [id]);
  return row ? JSON.parse(row.data) : null;
}

export function getCachedEscrows(): Record<string, unknown>[] {
  const rows = db.getAllSync<{ data: string }>(`SELECT data FROM escrows ORDER BY cached_at DESC`);
  return rows.map((r) => JSON.parse(r.data));
}

export function cacheMilestones(escrowId: string, milestones: Record<string, unknown>[]): void {
  db.runSync(`DELETE FROM milestones WHERE escrow_id = ?`, [escrowId]);
  for (const m of milestones) {
    db.runSync(`INSERT INTO milestones (id, escrow_id, data, cached_at) VALUES (?, ?, ?, ?)`, [
      Number(m.id),
      escrowId,
      JSON.stringify(m),
      Date.now(),
    ]);
  }
}

export function getCachedMilestones(escrowId: string): Record<string, unknown>[] {
  const rows = db.getAllSync<{ data: string }>(
    `SELECT data FROM milestones WHERE escrow_id = ? ORDER BY id`,
    [escrowId],
  );
  return rows.map((r) => JSON.parse(r.data));
}
