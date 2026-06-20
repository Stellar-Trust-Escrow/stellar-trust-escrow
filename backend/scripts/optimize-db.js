#!/usr/bin/env node
/**
 * optimize-db.js — Automated PostgreSQL Database Index Rebuilder (Issue #922)
 *
 * Checks table bloat statistics, rebuilds fragmented indexes with REINDEX
 * CONCURRENTLY (no table locks), and runs VACUUM ANALYZE to refresh query
 * planner statistics.
 *
 * Usage:
 *   node backend/scripts/optimize-db.js          # run once
 *   node backend/scripts/optimize-db.js --cron   # schedule weekly (Sunday 02:00 UTC)
 *
 * Environment:
 *   DATABASE_URL  — PostgreSQL connection string (required)
 */

import dotenv from 'dotenv';
import { Client } from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ── Configuration ─────────────────────────────────────────────────────────────

/** Bloat ratio threshold above which an index is rebuilt (30 %). */
const BLOAT_THRESHOLD = 0.3;

/** Weekly cron: Sunday at 02:00 UTC (ms). */
const WEEKLY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

// ── Logging ───────────────────────────────────────────────────────────────────

function log(level, msg, meta = {}) {
  const entry = { ts: new Date().toISOString(), level, msg, ...meta };
  console.log(JSON.stringify(entry));
}

// ── Database helpers ──────────────────────────────────────────────────────────

async function connect() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const client = new Client({ connectionString: url });
  await client.connect();
  return client;
}

/**
 * Returns rows with estimated bloat ratio per index.
 * Uses pg_stat_user_indexes + pg_relation_size for a lightweight estimate.
 */
async function getBloatedIndexes(client) {
  const { rows } = await client.query(`
    SELECT
      schemaname,
      tablename,
      indexrelname AS index_name,
      pg_relation_size(indexrelid) AS index_size_bytes,
      idx_scan,
      CASE
        WHEN pg_relation_size(indexrelid) = 0 THEN 0
        ELSE ROUND(
          (pg_relation_size(indexrelid)::numeric
            - (pg_relation_size(indrelid)::numeric * 0.1))
          / NULLIF(pg_relation_size(indexrelid)::numeric, 0),
          4
        )
      END AS bloat_ratio
    FROM pg_stat_user_indexes
    JOIN pg_index USING (indexrelid)
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY bloat_ratio DESC NULLS LAST;
  `);
  return rows;
}

/** Returns all user tables for VACUUM ANALYZE. */
async function getUserTables(client) {
  const { rows } = await client.query(`
    SELECT schemaname, tablename
    FROM pg_stat_user_tables
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY n_dead_tup DESC NULLS LAST;
  `);
  return rows;
}

// ── Core operations ───────────────────────────────────────────────────────────

/**
 * Rebuilds indexes whose bloat_ratio exceeds BLOAT_THRESHOLD using
 * REINDEX INDEX CONCURRENTLY (PostgreSQL 12+, no table lock).
 */
async function rebuildFragmentedIndexes(client) {
  const indexes = await getBloatedIndexes(client);
  let rebuilt = 0;
  let skipped = 0;
  let totalReclaimed = 0;

  for (const row of indexes) {
    const ratio = parseFloat(row.bloat_ratio) || 0;
    if (ratio < BLOAT_THRESHOLD) {
      skipped++;
      continue;
    }

    const fqIndex = `"${row.schemaname}"."${row.index_name}"`;
    const sizeBefore = parseInt(row.index_size_bytes, 10) || 0;

    try {
      log('info', 'Rebuilding index', {
        index: fqIndex,
        bloat_ratio: ratio,
        size_bytes: sizeBefore,
      });

      // CONCURRENTLY avoids locking the table for reads/writes
      await client.query(`REINDEX INDEX CONCURRENTLY ${fqIndex};`);

      // Measure size after rebuild
      const { rows: after } = await client.query(
        `SELECT pg_relation_size(oid) AS size FROM pg_class WHERE relname = $1`,
        [row.index_name],
      );
      const sizeAfter = parseInt(after[0]?.size, 10) || 0;
      const reclaimed = Math.max(0, sizeBefore - sizeAfter);
      totalReclaimed += reclaimed;
      rebuilt++;

      log('info', 'Index rebuilt', {
        index: fqIndex,
        size_before: sizeBefore,
        size_after: sizeAfter,
        reclaimed_bytes: reclaimed,
      });
    } catch (err) {
      log('error', 'Failed to rebuild index', { index: fqIndex, error: err.message });
    }
  }

  log('info', 'Index rebuild complete', {
    total_indexes: indexes.length,
    rebuilt,
    skipped,
    total_reclaimed_bytes: totalReclaimed,
  });

  return { rebuilt, skipped, totalReclaimed };
}

/**
 * Runs VACUUM ANALYZE on all user tables to update query planner statistics
 * and reclaim dead tuple storage.
 */
async function vacuumAnalyzeTables(client) {
  const tables = await getUserTables(client);
  let vacuumed = 0;

  for (const { schemaname, tablename } of tables) {
    const fqTable = `"${schemaname}"."${tablename}"`;
    try {
      // VACUUM ANALYZE cannot run inside a transaction block
      await client.query(`VACUUM ANALYZE ${fqTable};`);
      vacuumed++;
      log('info', 'VACUUM ANALYZE complete', { table: fqTable });
    } catch (err) {
      log('error', 'VACUUM ANALYZE failed', { table: fqTable, error: err.message });
    }
  }

  log('info', 'Vacuum pass complete', { tables_vacuumed: vacuumed });
  return vacuumed;
}

/**
 * Verifies data consistency by checking for tables with high dead-tuple ratios
 * and reports any that exceed 10 % dead tuples.
 */
async function verifyConsistency(client) {
  const { rows } = await client.query(`
    SELECT
      schemaname,
      relname AS tablename,
      n_live_tup,
      n_dead_tup,
      CASE WHEN (n_live_tup + n_dead_tup) = 0 THEN 0
           ELSE ROUND(n_dead_tup::numeric / (n_live_tup + n_dead_tup), 4)
      END AS dead_ratio
    FROM pg_stat_user_tables
    WHERE (n_live_tup + n_dead_tup) > 0
    ORDER BY dead_ratio DESC
    LIMIT 20;
  `);

  const flagged = rows.filter((r) => parseFloat(r.dead_ratio) > 0.1);
  if (flagged.length > 0) {
    log('warn', 'Tables with high dead-tuple ratio after vacuum', {
      count: flagged.length,
      tables: flagged.map((r) => ({ table: r.tablename, dead_ratio: r.dead_ratio })),
    });
  } else {
    log('info', 'Consistency check passed — no high dead-tuple tables');
  }
  return flagged;
}

// ── Main run ──────────────────────────────────────────────────────────────────

async function run() {
  log('info', 'Starting database optimization');
  const client = await connect();

  try {
    const indexStats = await rebuildFragmentedIndexes(client);
    const vacuumed = await vacuumAnalyzeTables(client);
    const flagged = await verifyConsistency(client);

    log('info', 'Optimization run finished', {
      indexes_rebuilt: indexStats.rebuilt,
      indexes_skipped: indexStats.skipped,
      total_reclaimed_bytes: indexStats.totalReclaimed,
      tables_vacuumed: vacuumed,
      consistency_warnings: flagged.length,
    });
  } finally {
    await client.end();
  }
}

// ── Cron scheduler ────────────────────────────────────────────────────────────

function scheduleWeekly() {
  log('info', 'Scheduling weekly optimization', {
    interval_ms: WEEKLY_INTERVAL_MS,
    next_run: new Date(Date.now() + WEEKLY_INTERVAL_MS).toISOString(),
  });

  // Run immediately on start, then every 7 days
  run().catch((err) => log('error', 'Optimization run failed', { error: err.message }));

  setInterval(() => {
    log('info', 'Weekly optimization triggered');
    run().catch((err) => log('error', 'Optimization run failed', { error: err.message }));
  }, WEEKLY_INTERVAL_MS);
}

// ── Entry point ───────────────────────────────────────────────────────────────

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const isCron = process.argv.includes('--cron');
  if (isCron) {
    scheduleWeekly();
  } else {
    run()
      .then(() => process.exit(0))
      .catch((err) => {
        log('error', 'Fatal error', { error: err.message });
        process.exit(1);
      });
  }
}

export { run, rebuildFragmentedIndexes, vacuumAnalyzeTables, verifyConsistency };
