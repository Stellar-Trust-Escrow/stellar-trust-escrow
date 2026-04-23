/**
 * backupMonitor.js — Tracks backup health and exposes it to the health/metrics endpoints.
 *
 * Reads the backup log file and the most recent .sha256 file to determine:
 *  - When the last backup ran
 *  - Whether it succeeded
 *  - How many backups are on disk
 *
 * Used by GET /health (status field) and GET /metrics (Prometheus gauge).
 */

import fs from 'fs';
import { glob } from 'glob';

const BACKUP_DIR = process.env.BACKUP_DIR || '/var/backups/stellar-trust';
const MAX_BACKUP_AGE_HOURS = Number(process.env.BACKUP_MAX_AGE_HOURS || 26); // alert if no backup in 26h

/**
 * Returns the status of the most recent backup.
 * @returns {{ ok: boolean, lastBackupAt: string|null, backupCount: number, ageHours: number|null }}
 */
export async function getBackupStatus() {
  let files = [];
  try {
    files = await glob(`${BACKUP_DIR}/backup_*.dump`);
  } catch {
    return { ok: false, lastBackupAt: null, backupCount: 0, ageHours: null };
  }

  if (files.length === 0) {
    return { ok: false, lastBackupAt: null, backupCount: 0, ageHours: null };
  }

  // Sort by mtime descending
  const sorted = files
    .map((f) => ({ file: f, mtime: fs.statSync(f).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  const latest = sorted[0];
  const lastBackupAt = new Date(latest.mtime).toISOString();
  const ageHours = (Date.now() - latest.mtime) / 3_600_000;

  // Verify checksum file exists alongside the dump
  const checksumFile = `${latest.file}.sha256`;
  const checksumExists = fs.existsSync(checksumFile);

  const ok = checksumExists && ageHours <= MAX_BACKUP_AGE_HOURS;

  return {
    ok,
    lastBackupAt,
    backupCount: files.length,
    ageHours: Math.round(ageHours * 10) / 10,
  };
}
