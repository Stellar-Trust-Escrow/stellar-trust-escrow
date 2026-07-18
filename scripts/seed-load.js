#!/usr/bin/env node
/**
 * Load-seed for migration performance testing.
 *
 * Inserts a large, realistic dataset so that migration apply time and lock
 * behaviour can be measured against production-like data volumes:
 *
 *   - 100,000 escrow rows   (override with ESCROW_ROWS)
 *   - 500,000 milestone rows (override with MILESTONE_ROWS, default = 5 × escrows)
 *
 * Designed to run against the *already-migrated* schema in CI (PostgreSQL
 * service). It uses batched, parameterised multi-row INSERTs for throughput.
 *
 * Usage:
 *   node scripts/seed-load.js                 # 100k escrows + 500k milestones
 *   ESCROW_ROWS=1000 MILESTONE_ROWS=5000 node scripts/seed-load.js
 */

import { createRequire } from 'node:module';
import { resolve } from 'node:path';

// Resolve @prisma/client from the backend workspace (root `type: module` means
// ESM bare-specifier resolution would otherwise look in repo/scripts/node_modules).
const require = createRequire(resolve(process.cwd(), 'backend/package.json'));
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const ESCROW_ROWS = parseInt(process.env.ESCROW_ROWS || '100000', 10);
const MILESTONE_ROWS = parseInt(process.env.MILESTONE_ROWS || String(ESCROW_ROWS * 5), 10);
const BATCH = 2000;
const TENANT_ID = process.env.SEED_TENANT_ID || 'load_test_tenant';
const STATUSES = ['Active', 'Completed', 'Disputed', 'Cancelled'];
const MILESTONE_STATUSES = ['Pending', 'Submitted', 'Approved', 'Rejected'];

// ── helpers ───────────────────────────────────────────────────────────────────

function fakeStellarAddress(seed) {
  // Deterministic, valid-looking Stellar ed25519 public key (G + 55 base32 chars).
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let s = (seed * 2654435761) >>> 0;
  let out = 'G';
  for (let i = 0; i < 55; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    out += alphabet[s % alphabet.length];
  }
  return out;
}

function fakeHash(seed) {
  let s = (seed * 40503) >>> 0;
  let h = '';
  for (let i = 0; i < 46; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    h += 'abcdefghijklmnopqrstuvwxyz0123456789'[(s >>> 0) % 36];
  }
  return h;
}

function buildInsert(table, columns, rows) {
  const colList = columns.join(', ');
  const placeholders = rows
    .map((_, r) => '(' + columns.map((_, c) => `$${r * columns.length + c + 1}`).join(', ') + ')')
    .join(', ');
  const params = [];
  for (const row of rows) for (const v of row) params.push(v);
  return { sql: `INSERT INTO ${table} (${colList}) VALUES ${placeholders}`, params };
}

async function chunkedInsert(table, columns, rows, label) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { sql, params } = buildInsert(table, columns, slice);
    await prisma.$executeRawUnsafe(sql, ...params);
    inserted += slice.length;
    if (inserted % (BATCH * 25) === 0 || inserted === rows.length) {
      console.log(`   …${label}: ${inserted.toLocaleString()}/${rows.length.toLocaleString()}`);
    }
  }
  return inserted;
}

// ── main ───────────────────────────────────────────────────────────────────────

async function main() {
  const started = Date.now();
  console.log(`🌱 Load seed — ${ESCROW_ROWS.toLocaleString()} escrows, ${MILESTONE_ROWS.toLocaleString()} milestones\n`);

  // 1. Tenant (required FK for escrows/milestones)
  await prisma.$executeRawUnsafe(
    `INSERT INTO tenants (id, slug, name, status, domains, created_at, updated_at)
     VALUES ($1, $2, $3, 'active', '[]', NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    TENANT_ID,
    'load-test',
    'Load Test Tenant',
  );
  console.log(`✅ Tenant:     ${TENANT_ID}`);

  // 2. Escrows (batched)
  const escrowCols = [
    'id', 'tenant_id', 'client_address', 'freelancer_address', 'arbiter_address',
    'token_address', 'total_amount', 'remaining_balance', 'status', 'brief_hash',
    'deadline', 'created_at', 'updated_at', 'created_ledger',
  ];
  const escrowRows = [];
  for (let i = 1; i <= ESCROW_ROWS; i++) {
    const status = STATUSES[i % STATUSES.length];
    const deadline = i % 3 === 0 ? new Date(Date.UTC(2030, 0, 1)) : null;
    escrowRows.push([
      BigInt(i),
      TENANT_ID,
      fakeStellarAddress(i * 2 + 1),
      fakeStellarAddress(i * 2 + 2),
      i % 4 === 0 ? fakeStellarAddress(i * 2 + 3) : null,
      fakeStellarAddress(999 + i),
      String(1_000_000_000 + i),
      String(500_000_000 + (i % 10)),
      status,
      fakeHash(i),
      deadline,
      new Date(Date.UTC(2024, 0, 1) + i * 1000),
      new Date(Date.UTC(2024, 0, 1) + i * 1000),
      BigInt(1000 + i),
    ]);
  }
  const escrowsInserted = await chunkedInsert('escrows', escrowCols, escrowRows, 'Escrows');
  console.log(`✅ Escrows:    ${escrowsInserted.toLocaleString()}`);

  // 3. Milestones (5 per escrow, batched)
  const msCols = [
    'tenant_id', 'milestone_index', 'escrow_id', 'title',
    'description_hash', 'amount', 'status', 'submitted_at', 'resolved_at',
  ];
  const msRows = [];
  let mi = 0;
  for (let i = 1; i <= ESCROW_ROWS && mi < MILESTONE_ROWS; i++) {
    for (let k = 0; k < 5 && mi < MILESTONE_ROWS; k++, mi++) {
      const status = MILESTONE_STATUSES[mi % MILESTONE_STATUSES.length];
      msRows.push([
        TENANT_ID,
        k,
        BigInt(i),
        `Milestone ${k + 1}`,
        fakeHash(mi + 7),
        String(100_000 + mi),
        status,
        status === 'Pending' ? null : new Date(Date.UTC(2024, 1, 1) + mi * 1000),
        status === 'Approved' || status === 'Rejected' ? new Date(Date.UTC(2024, 2, 1) + mi * 1000) : null,
      ]);
    }
  }
  const msInserted = await chunkedInsert('milestones', msCols, msRows, 'Milestones');
  console.log(`✅ Milestones: ${msInserted.toLocaleString()}`);

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  const report = {
    tool: 'seed-load',
    generatedAt: new Date().toISOString(),
    tenantId: TENANT_ID,
    escrows: escrowsInserted,
    milestones: msInserted,
    durationSeconds: Number(elapsed),
  };
  console.log(`\n⏱  Seed complete in ${elapsed}s`);
  try {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(resolve(process.cwd(), 'seed-load-report.json'), JSON.stringify(report, null, 2));
  } catch {
    /* non-fatal */
  }
}

main()
  .catch(async (e) => {
    console.error('❌ seed-load failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
