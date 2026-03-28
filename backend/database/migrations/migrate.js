/**
 * Database Migration Runner
 *
 * Versioned migration system with rollback support built on top of Prisma Migrate.
 *
 * Usage:
 *   node database/migrations/migrate.js up        # apply all pending migrations
 *   node database/migrations/migrate.js down      # roll back the last migration
 *   node database/migrations/migrate.js status    # show migration status
 *   node database/migrations/migrate.js create <name>  # scaffold a new migration
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import { writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

// ── Migration log table (created on first run) ────────────────────────────────

async function ensureMigrationLog() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS _migration_log (
      id          SERIAL PRIMARY KEY,
      version     VARCHAR(255) NOT NULL UNIQUE,
      name        VARCHAR(255) NOT NULL,
      applied_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      rolled_back BOOLEAN      NOT NULL DEFAULT FALSE
    )
  `);
}

async function getApplied() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT version FROM _migration_log WHERE rolled_back = FALSE ORDER BY version ASC`,
  );
  return rows.map((r) => r.version);
}

async function logMigration(version, name) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO _migration_log (version, name) VALUES ($1, $2) ON CONFLICT (version) DO UPDATE SET rolled_back = FALSE, applied_at = NOW()`,
    version,
    name,
  );
}

async function unlogMigration(version) {
  await prisma.$executeRawUnsafe(
    `UPDATE _migration_log SET rolled_back = TRUE WHERE version = $1`,
    version,
  );
}

// ── Migration file discovery ──────────────────────────────────────────────────

function getMigrationFiles() {
  return readdirSync(__dirname)
    .filter((f) => /^\d{14}_.*\.js$/.test(f))
    .sort();
}

// ── Commands ──────────────────────────────────────────────────────────────────

async function up() {
  await ensureMigrationLog();
  const applied = await getApplied();
  const files = getMigrationFiles();
  const pending = files.filter((f) => !applied.includes(f.replace('.js', '')));

  if (pending.length === 0) {
    console.log('✅ No pending migrations.');
    return;
  }

  for (const file of pending) {
    const version = file.replace('.js', '');
    console.log(`⬆  Applying ${version}…`);
    const mod = await import(join(__dirname, file));
    await mod.up(prisma);
    await logMigration(version, file);
    console.log(`   ✅ Applied ${version}`);
  }
}

async function down() {
  await ensureMigrationLog();
  const applied = await getApplied();

  if (applied.length === 0) {
    console.log('Nothing to roll back.');
    return;
  }

  const last = applied[applied.length - 1];
  console.log(`⬇  Rolling back ${last}…`);
  const mod = await import(join(__dirname, `${last}.js`));

  if (!mod.down) {
    console.error(`❌ Migration ${last} has no down() export — cannot roll back.`);
    process.exit(1);
  }

  await mod.down(prisma);
  await unlogMigration(last);
  console.log(`   ✅ Rolled back ${last}`);
}

async function status() {
  await ensureMigrationLog();
  const applied = await getApplied();
  const files = getMigrationFiles();

  console.log('\nMigration Status\n' + '─'.repeat(60));
  if (files.length === 0) {
    console.log('  No migration files found.');
  }
  for (const file of files) {
    const version = file.replace('.js', '');
    const state = applied.includes(version) ? '✅ applied' : '⏳ pending';
    console.log(`  ${state}  ${version}`);
  }

  // Also show Prisma migrate status
  console.log('\nPrisma Migrate Status\n' + '─'.repeat(60));
  try {
    execSync('npx prisma migrate status', { stdio: 'inherit' });
  } catch {
    // non-zero exit is fine — prisma prints the status itself
  }
}

function create(name) {
  if (!name) {
    console.error('Usage: migrate.js create <migration-name>');
    process.exit(1);
  }
  const ts = new Date()
    .toISOString()
    .replace(/[-T:.Z]/g, '')
    .slice(0, 14);
  const slug = name.toLowerCase().replace(/\s+/g, '_');
  const filename = `${ts}_${slug}.js`;
  const filepath = join(__dirname, filename);

  writeFileSync(
    filepath,
    `/**
 * Migration: ${name}
 * Version:   ${ts}_${slug}
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function up(prisma) {
  // TODO: implement migration
  // await prisma.$executeRawUnsafe(\`ALTER TABLE ...\`);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function down(prisma) {
  // TODO: implement rollback
  // await prisma.$executeRawUnsafe(\`ALTER TABLE ...\`);
}
`,
  );

  console.log(`✅ Created migration: ${filename}`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

const [, , command, ...args] = process.argv;

try {
  switch (command) {
    case 'up':
      await up();
      break;
    case 'down':
      await down();
      break;
    case 'status':
      await status();
      break;
    case 'create':
      create(args.join(' '));
      break;
    default:
      console.error('Usage: migrate.js <up|down|status|create <name>>');
      process.exit(1);
  }
} finally {
  await prisma.$disconnect();
}
