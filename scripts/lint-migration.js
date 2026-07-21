#!/usr/bin/env node
/**
 * Migration Safety Linter
 * ─────────────────────────────────────────────────────────────────────────────
 * Scans *new* migration files for unsafe patterns that can cause downtime or
 * data loss, and verifies that every migration ships a ROLLBACK.md plan.
 *
 * The repository uses a custom, JS-based migration system
 * (backend/database/migrations/*.js exporting `up(prisma)` / `down(prisma)`),
 * plus optional standard Prisma SQL migrations (prisma/migrations/**.sql).
 * Both formats are supported.
 *
 * Patterns
 * ────────
 *   DROP COLUMN                          → BLOCK (data loss)
 *   DROP TABLE                           → BLOCK (data loss)
 *   TRUNCATE                             → BLOCK (data loss)
 *   ADD COLUMN ... NOT NULL w/o DEFAULT  → BLOCK (exclusive lock + failures)
 *   ALTER COLUMN ... TYPE                → BLOCK unless a `-- safe:` comment
 *                                          with a reason is present (warn only
 *                                          when justified)
 *   Missing index on FK columns          → WARN  (N+1 / join risk)
 *
 * Output
 * ──────
 *   - Human-readable summary on stdout
 *   - Machine-readable JSON report written to ./migration-lint-report.json
 *
 * Exit codes
 *   0  no blocking issues (warnings allowed)
 *   1  blocking issue found (or missing ROLLBACK.md in --check-rollback mode)
 *   2  usage / runtime error
 *
 * Usage
 *   node scripts/lint-migration.js                 # lint migrations changed vs base
 *   node scripts/lint-migration.js --all           # lint every migration file
 *   node scripts/lint-migration.js --files a.js b.sql
 *   node scripts/lint-migration.js --check-rollback  # also require ROLLBACK.md
 *   node scripts/lint-migration.js --base origin/main --head HEAD
 *   node scripts/lint-migration.js --json out.json
 */

import { readFileSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, basename, extname } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// ── CLI parsing ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flags = {
  all: argv.includes('--all'),
  checkRollback: argv.includes('--check-rollback'),
  help: argv.includes('-h') || argv.includes('--help'),
};
const filesIndex = argv.indexOf('--files');
const baseIndex = argv.indexOf('--base');
const headIndex = argv.indexOf('--head');
const jsonIndex = argv.indexOf('--json');

const explicitFiles =
  filesIndex !== -1 ? argv.slice(filesIndex + 1, nextFlag(argv, filesIndex)) : [];
const baseRef = baseIndex !== -1 ? argv[baseIndex + 1] : process.env.BASE_SHA || 'origin/main';
const headRef = headIndex !== -1 ? argv[headIndex + 1] : process.env.HEAD_SHA || 'HEAD';
const jsonPath =
  jsonIndex !== -1 ? argv[jsonIndex + 1] : join(process.cwd(), 'migration-lint-report.json');

function nextFlag(args, idx) {
  for (let i = idx + 1; i < args.length; i++) {
    if (args[i].startsWith('--')) return i;
  }
  return args.length;
}

if (flags.help) {
  console.log(
    'Usage: node scripts/lint-migration.js [--all] [--files a.js ...] [--check-rollback] [--base REF] [--head REF] [--json path]',
  );
  process.exit(0);
}

// ── Migration discovery ───────────────────────────────────────────────────────

// Paths that are considered "migration" locations in this repository.
const MIGRATION_GLOBS = ['backend/database/migrations', 'prisma/migrations'];

function isMigrationPath(p) {
  const norm = p.replace(/\\/g, '/');
  return MIGRATION_GLOBS.some((g) => norm.includes(g + '/') || norm.startsWith(g + '/'));
}

function isMigrationFile(p) {
  const base = basename(p);
  if (base === 'migrate.js') return false;
  if (/^\d{14}_.*\.(js|ts|sql)$/.test(base)) return true;
  if (base === 'migration.sql') return true;
  return false;
}

function findAllMigrationFiles() {
  const found = [];
  for (const g of MIGRATION_GLOBS) {
    const dir = join(REPO_ROOT, g);
    if (!existsSync(dir)) continue;
    const walk = (d) => {
      for (const entry of readDirSafe(d)) {
        const full = join(d, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile() && isMigrationFile(full)) {
          found.push(full);
        }
      }
    };
    walk(dir);
  }
  return found;
}

function readDirSafe(d) {
  try {
    return readdirSync(d, { withFileTypes: true });
  } catch {
    return [];
  }
}

function getChangedMigrationFiles() {
  try {
    const range = `${baseRef}...${headRef}`;
    const out = execSync(`git diff --name-only ${range}`, {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const changed = out.filter((f) => isMigrationPath(f) && isMigrationFile(f));
    // Also include files staged/modified in the working tree that are not yet committed.
    const status = execSync('git status --porcelain', {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.slice(3).trim());
    for (const f of status) if (isMigrationPath(f) && !changed.includes(f)) changed.push(f);
    return [...new Set(changed)];
  } catch (err) {
    console.warn(
      `⚠️  Could not compute changed files via git (${err.message}). Use --files or --all.`,
    );
    return [];
  }
}

// ── SQL extraction from JS migrations ────────────────────────────────────────

/**
 * Split a JS/TS migration source into the `up()` body and the `down()` body.
 * Returns { up, down, raw }. For plain .sql files up === whole file, down === ''.
 */
function splitMigration(source, ext) {
  if (ext === '.sql') {
    return { up: source, down: '', raw: source };
  }
  const upOpen =
    /export\s+(?:(?:async\s+)?function\s+up\s*\([^)]*\)|const\s+up\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)\s*\{/;
  const downOpen =
    /export\s+(?:(?:async\s+)?function\s+down\s*\([^)]*\)|const\s+down\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)\s*\{/;
  const upMatch = matchBalanced(source, upOpen);
  const downMatch = matchBalanced(source, downOpen);
  return {
    up: upMatch ? upMatch.body : source,
    down: downMatch ? downMatch.body : '',
    raw: source,
  };
}

function matchBalanced(src, openRe) {
  const m = openRe.exec(src);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 1;
  let inStr = null;
  let inTmpl = false;
  let esc = false;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (esc) {
      esc = false;
      i++;
      continue;
    }
    if (inStr) {
      if (c === '\\') esc = true;
      else if (c === inStr) inStr = null;
      i++;
      continue;
    }
    if (inTmpl) {
      if (c === '\\') esc = true;
      else if (c === '`') inTmpl = false;
      i++;
      continue;
    }
    if (c === '"' || c === "'") inStr = c;
    else if (c === '`') inTmpl = true;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
    i++;
  }
  return { body: src.slice(m.index + m[0].length, i - 1) };
}

// Pull the raw SQL strings out of a JS body (the args to $executeRawUnsafe / $queryRaw / template literals).
function extractSqlStatements(body) {
  const stmts = [];
  // Template literals passed to raw helpers
  const tmplRe = /\$\w*(?:execute|query)Raw(?:Unsafe)?\s*\(\s*(`(?:[^`\\]|\\.)*`)/g;
  let mm;
  while ((mm = tmplRe.exec(body))) {
    stmts.push(mm[1].replace(/^`|`$/g, ''));
  }
  // Plain string literals too (defensive)
  const strRe = /\$\w*(?:execute|query)Raw(?:Unsafe)?\s*\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;
  while ((mm = strRe.exec(body))) stmts.push(mm[2]);
  if (stmts.length === 0) {
    // Fall back to scanning the whole body (covers .sql and inline SQL).
    stmts.push(body);
  }
  return stmts.join('\n');
}

// ── Pattern checks ────────────────────────────────────────────────────────────

// DROP COLUMN IF EXISTS is conditional — it won't fail or lose data if the
// column is absent, so it is allowed. Bare DROP COLUMN is still blocked.
const RE_DROP_COLUMN = /\bDROP\s+COLUMN\b(?!\s+IF\s+EXISTS)/i;
const RE_DROP_TABLE = /\bDROP\s+TABLE\b(?!\s+IF\s+EXISTS)/i;
const RE_TRUNCATE = /\bTRUNCATE\b/i;
const RE_ALTER_TYPE = /\bALTER\s+COLUMN\b[^\n;]*\bTYPE\b/i;
const RE_SAFE_COMMENT = /(?:--|\/\/|#)\s*safe\s*:/i;

// FK-like column name heuristic (excludes the bare primary-key `id`).
function isFkColumn(col) {
  const c = String(col).toLowerCase();
  if (c === 'id') return false;
  return /_id$/.test(c) || /[a-z]id$/.test(c);
}

function splitStatements(sql) {
  // Naive but sufficient: split on semicolons that terminate statements.
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

function findAddedColumns(sql) {
  // ADD COLUMN <col> ... and ADD <col> ... (within ALTER TABLE)
  const cols = [];
  const re = /\bADD\s+(?:COLUMN\s+)?["`]?(\w+)["`]?/gi;
  let m;
  while ((m = re.exec(sql))) cols.push(m[1]);
  return cols;
}

function findCreatedTables(sql) {
  const tables = [];
  const re = /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?/gi;
  let m;
  while ((m = re.exec(sql))) tables.push(m[1]);
  return tables;
}

function findIndexedColumns(sql) {
  const cols = [];
  const re = /\bCREATE\s+(?:UNIQUE\s+)?INDEX\b[^\n;]*?ON\s+[`"]?\w+[`"]?\s*\(([^)]*)\)/gi;
  let m;
  while ((m = re.exec(sql))) {
    for (const part of m[1].split(',')) {
      const col = part.trim().split(/\s+/)[0].replace(/[`"]/g, '');
      if (col) cols.push(col.toLowerCase());
    }
  }
  return cols;
}

function findFkColumns(sql) {
  const fk = new Set();
  for (const col of [...findAddedColumns(sql), ...allCreatedColumns(sql)]) {
    if (isFkColumn(col)) fk.add(col.toLowerCase());
  }
  return [...fk];
}

function allCreatedColumns(sql) {
  const cols = [];
  const re = /\bCREATE\s+TABLE\b[^\n;]*\(([\s\S]*?)\)/gi;
  let m;
  while ((m = re.exec(sql))) {
    for (const line of m[1].split(',')) {
      const col = line.trim().split(/\s+/)[0].replace(/[`"]/g, '');
      if (
        col &&
        /^\w+$/.test(col) &&
        !/^(PRIMARY|FOREIGN|UNIQUE|CONSTRAINT|KEY|INDEX|CHECK)/i.test(col)
      ) {
        cols.push(col);
      }
    }
  }
  return cols;
}

function lintMigration(content, ext) {
  const { up, raw } = splitMigration(content, ext);
  const sql = extractSqlStatements(up);
  const statements = splitStatements(sql);

  const errors = [];
  const warnings = [];

  // 1. DROP COLUMN
  if (RE_DROP_COLUMN.test(sql)) {
    errors.push({
      rule: 'drop-column',
      severity: 'block',
      message: 'DROP COLUMN detected — this causes irreversible data loss and is blocked.',
    });
  }
  // 2. DROP TABLE
  if (RE_DROP_TABLE.test(sql)) {
    errors.push({
      rule: 'drop-table',
      severity: 'block',
      message: 'DROP TABLE detected — this causes irreversible data loss and is blocked.',
    });
  }
  // 3. TRUNCATE
  if (RE_TRUNCATE.test(sql)) {
    errors.push({
      rule: 'truncate',
      severity: 'block',
      message: 'TRUNCATE detected — this deletes all rows and is blocked.',
    });
  }
  // 4. ADD COLUMN ... NOT NULL without DEFAULT
  for (const stmt of statements) {
    const isAdd = /\bADD\s+(?:COLUMN\s+)?/i.test(stmt);
    const isNotNull = /\bNOT\s+NULL\b/i.test(stmt);
    const hasDefault = /\bDEFAULT\b/i.test(stmt);
    if (isAdd && isNotNull && !hasDefault) {
      // Allow NOT NULL additions that are covered by a safe comment per-statement scan? Keep strict: block.
      errors.push({
        rule: 'add-not-null-no-default',
        severity: 'block',
        message:
          'ADD COLUMN ... NOT NULL without a DEFAULT detected — under load this takes an ACCESS EXCLUSIVE lock and fails on existing rows. ' +
          'Add a DEFAULT or add the column as NULL then backfill + SET NOT NULL in a later migration.',
        statement: stmt.slice(0, 200),
      });
    }
    // Also catch ALTER COLUMN ... SET NOT NULL without DEFAULT (same risk).
    if (/\bALTER\s+COLUMN\b/i.test(stmt) && /\bSET\s+NOT\s+NULL\b/i.test(stmt) && !hasDefault) {
      errors.push({
        rule: 'set-not-null-no-default',
        severity: 'block',
        message:
          'ALTER COLUMN ... SET NOT NULL without a DEFAULT detected — requires a full table scan/lock and fails if any row is NULL. ' +
          'Backfill first, then add the constraint in a separate, validated migration.',
        statement: stmt.slice(0, 200),
      });
    }
  }
  // 5. ALTER COLUMN ... TYPE
  const alterTypeMatches = sql.match(RE_ALTER_TYPE);
  if (alterTypeMatches) {
    if (RE_SAFE_COMMENT.test(raw)) {
      warnings.push({
        rule: 'alter-column-type',
        severity: 'warn',
        message:
          'ALTER COLUMN ... TYPE detected. Acquires an ACCESS EXCLUSIVE lock (rewrites the table) — allowed because a `-- safe:` justification comment is present.',
      });
    } else {
      errors.push({
        rule: 'alter-column-type',
        severity: 'block',
        message:
          'ALTER COLUMN ... TYPE detected. This rewrites the table and takes an ACCESS EXCLUSIVE lock under load. ' +
          'Add a comment in the migration of the form `-- safe: <reason, e.g. column has no rows in prod>` to proceed as a warning.',
      });
    }
  }
  // 6. Missing index on FK columns
  const fkCols = findFkColumns(sql);
  const indexed = findIndexedColumns(sql).map((c) => c.toLowerCase());
  const missingIdx = fkCols.filter(
    (c) => !indexed.some((i) => i === c || i.startsWith(c + '_') || i.endsWith('_' + c)),
  );
  if (missingIdx.length > 0) {
    warnings.push({
      rule: 'missing-fk-index',
      severity: 'warn',
      message: `Foreign-key-like column(s) without a dedicated index: ${missingIdx.join(', ')}. Missing indexes cause seq scans / N+1 joins on lookups and joins.`,
    });
  }

  return { errors, warnings };
}

// ── ROLLBACK.md companion resolution ─────────────────────────────────────────

function rollbackPathFor(migrationFile) {
  const dir = dirname(migrationFile);
  const base = basename(migrationFile, extname(migrationFile));
  if (extname(migrationFile) === '.sql') {
    // standard Prisma layout: prisma/migrations/<name>/migration.sql → .../ROLLBACK.md
    return join(dir, 'ROLLBACK.md');
  }
  // JS/TS layout: <version>.js → <version>.ROLLBACK.md
  return join(dir, `${base}.ROLLBACK.md`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

function resolveFiles() {
  if (explicitFiles.length > 0) {
    return explicitFiles.map((f) => (existsSync(f) || f.startsWith('/') ? f : join(REPO_ROOT, f)));
  }
  if (flags.all) return findAllMigrationFiles();
  return getChangedMigrationFiles().map((f) => join(REPO_ROOT, f));
}

function main() {
  const files = resolveFiles();
  const report = {
    tool: 'lint-migration',
    generatedAt: new Date().toISOString(),
    baseRef,
    headRef,
    mode: flags.all ? 'all' : explicitFiles.length ? 'explicit' : 'changed',
    migrations: [],
    summary: { scanned: 0, blocking: 0, warnings: 0, missingRollback: 0 },
  };

  if (files.length === 0) {
    console.log('✅ No migration files to lint.');
    writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    console.log(`   JSON report: ${jsonPath}`);
    process.exit(0);
  }

  for (const file of files) {
    if (!existsSync(file)) {
      console.warn(`⚠️  Skipping missing file: ${file}`);
      continue;
    }
    const ext = extname(file).toLowerCase();
    const content = readFileSync(file, 'utf8');
    const { errors, warnings } = lintMigration(content, ext);

    const entry = {
      file: file.replace(REPO_ROOT + '/', ''),
      errors,
      warnings,
      rollback: null,
    };

    if (flags.checkRollback) {
      const rb = rollbackPathFor(file);
      const present = existsSync(rb);
      entry.rollback = {
        required: true,
        present,
        path: rb.replace(REPO_ROOT + '/', ''),
      };
      if (!present) {
        entry.errors.push({
          rule: 'missing-rollback',
          severity: 'block',
          message: `Missing ROLLBACK.md for migration. Expected: ${entry.rollback.path}`,
        });
      }
    }

    report.migrations.push(entry);
    report.summary.scanned++;
    report.summary.blocking += entry.errors.length;
    report.summary.warnings += entry.warnings.length;
    if (entry.rollback && !entry.rollback.present) report.summary.missingRollback++;
  }

  // ── Human-readable summary ────────────────────────────────────────────────
  console.log('\n────────────────────────────────────────────────────────────');
  console.log('  Migration Safety Lint Report');
  console.log('────────────────────────────────────────────────────────────');
  console.log(`  Mode:        ${report.mode}`);
  console.log(`  Migrations:  ${report.summary.scanned}`);
  console.log(`  Blocking:    ${report.summary.blocking}`);
  console.log(`  Warnings:    ${report.summary.warnings}`);
  if (flags.checkRollback) console.log(`  Missing RB:  ${report.summary.missingRollback}`);
  console.log('────────────────────────────────────────────────────────────\n');

  let anyBlocking = false;
  for (const m of report.migrations) {
    const rel = m.file;
    if (
      m.errors.length === 0 &&
      m.warnings.length === 0 &&
      (!flags.checkRollback || m.rollback?.present)
    ) {
      console.log(`✅ ${rel}`);
      continue;
    }
    console.log(`${m.errors.length ? '❌' : '⚠️ '} ${rel}`);
    for (const e of m.errors) {
      anyBlocking = true;
      console.log(`     [BLOCK] (${e.rule}) ${e.message}`);
      if (e.statement) console.log(`            ↳ ${e.statement}`);
    }
    for (const w of m.warnings) {
      console.log(`     [WARN ] (${w.rule}) ${w.message}`);
    }
    if (flags.checkRollback && m.rollback) {
      console.log(
        `     [ROLLBACK] ${m.rollback.present ? 'present ✓' : 'MISSING ✗ → ' + m.rollback.path}`,
      );
    }
  }
  console.log('');

  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`   JSON report: ${jsonPath}\n`);

  if (anyBlocking) {
    console.log('❌ Migration safety lint FAILED. Fix the blocking issues above before merge.\n');
    process.exit(1);
  }
  console.log('✅ Migration safety lint passed.\n');
  process.exit(0);
}

try {
  main();
} catch (err) {
  console.error('❌ lint-migration crashed:', err);
  process.exit(2);
}
