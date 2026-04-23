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

export function cacheEscrow(escrow: Record<string, unknown>): void {
  db.runSync(
    `INSERT OR REPLACE INTO escrows (id, data, cached_at) VALUES (?, ?, ?)`,
    [String(escrow.id), JSON.stringify(escrow), Date.now()],
  );
}

export function getCachedEscrow(id: string): Record<string, unknown> | null {
  const row = db.getFirstSync<{ data: string }>(
    `SELECT data FROM escrows WHERE id = ?`,
    [id],
  );
  return row ? (JSON.parse(row.data) as Record<string, unknown>) : null;
}

export function getCachedEscrows(): Record<string, unknown>[] {
  const rows = db.getAllSync<{ data: string }>(`SELECT data FROM escrows ORDER BY cached_at DESC`);
  return rows.map((r: { data: string }) => JSON.parse(r.data) as Record<string, unknown>);
}

export function cacheMilestones(escrowId: string, milestones: Record<string, unknown>[]): void {
  db.runSync(`DELETE FROM milestones WHERE escrow_id = ?`, [escrowId]);
  for (const m of milestones) {
    db.runSync(
      `INSERT INTO milestones (id, escrow_id, data, cached_at) VALUES (?, ?, ?, ?)`,
      [Number(m.id), escrowId, JSON.stringify(m), Date.now()],
    );
  }
}

export function getCachedMilestones(escrowId: string): Record<string, unknown>[] {
  const rows = db.getAllSync<{ data: string }>(
    `SELECT data FROM milestones WHERE escrow_id = ? ORDER BY id`,
    [escrowId],
  );
  return rows.map((r: { data: string }) => JSON.parse(r.data) as Record<string, unknown>);
}
