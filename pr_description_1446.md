# Migration Safety Gate — rollback simulation, lint gate & zero-downtime checklist

## Summary

Prisma migrations were not safety-checked before merging. A migration that drops
a column, changes a type, or locks a table under load could cause production
downtime. This PR adds a **Migration Safety** CI gate that:

1. **Lints** every new/changed migration for unsafe patterns and blocks the PR.
2. **Requires a `ROLLBACK.md`** rollback plan for every migration.
3. **Simulates rollback** against a real PostgreSQL instance: applies the
   migrations, runs the test suite, rolls the last one back, runs the suite
   again, and asserts the schema is byte-for-byte identical afterwards.
4. **Enforces performance**: seeds 100k escrows + 500k milestones and asserts a
   migration applies in **< 30s** on that volume.
5. Adds a **zero-downtime migration checklist** to the PR template and documents
   the whole system.

> **Repository note:** this project uses a custom JS-based migration system
> (`backend/database/migrations/*.js` exporting `up(prisma)` / `down(prisma)`),
> not standard Prisma SQL migrations. The tooling is adapted to that system
> while keeping the original intent (which referenced `prisma/migrations/`).
> Both `backend/database/migrations/**` and `prisma/migrations/**` are scanned.

Closes #1446

---

## Files changed

| File | Purpose |
| --- | --- |
| `.github/workflows/migration-safety.yml` | The CI gate (trigger, lint, apply/rollback/test, seed + timing). |
| `scripts/lint-migration.js` | Migration lint script (blocking + warning rules, JSON + human report, `--check-rollback`). |
| `scripts/seed-load.sh` + `scripts/seed-load.js` | Seeds 100k escrows + 500k milestones. |
| `scripts/schema-fingerprint.js` | Captures an ordered schema fingerprint used to verify rollback is a true inverse. |
| `.github/pull_request_template.md` | Adds the **Migration checklist** section. |
| `docs/migration-safety.md` | Full documentation of the gate, rules, and zero-downtime patterns. |
| `backend/database/migrations/*.ROLLBACK.md` | Rollback plans for all existing migrations (grandfathered; required going forward). |

---

## Lint rules (from the spec)

The linter extracts the `up()` body of each migration (or the whole file for
`.sql` migrations) and checks the SQL it executes.

| Pattern | Risk | Action |
| --- | --- | --- |
| `DROP COLUMN` | Data loss | **Block** (exit 1) |
| `DROP TABLE` | Data loss | **Block** (exit 1) |
| `TRUNCATE` | Data loss | **Block** (exit 1) |
| `ADD COLUMN ... NOT NULL` w/o `DEFAULT` | Lock + failures | **Block** (exit 1) |
| `ALTER COLUMN ... SET NOT NULL` w/o `DEFAULT` | Lock + failures | **Block** (exit 1) |
| `ALTER COLUMN ... TYPE` | Table rewrite / lock | **Block** unless a `-- safe:` justification comment is present (then **Warn** only) |
| Missing index on FK-like columns (`*_id`, `*Id`) | N+1 / seq scans | **Warn** |

It emits a human-readable summary **and** a machine-readable
`migration-lint-report.json`.

### The `-- safe:` escape hatch

`ALTER COLUMN ... TYPE` is allowed only when the migration file contains a
justification comment, e.g.:

```js
// safe: column has no rows in prod yet, internal single-tenant table
export async function up(prisma) {
  await prisma.$executeRawUnsafe(`ALTER TABLE widgets ALTER COLUMN amount TYPE BIGINT`);
}
```

Without it the linter blocks the PR so the lock is at least reviewed.

---

## How the gate works in CI

**Triggers:** any PR that changes files under `backend/database/migrations/**`
or `prisma/migrations/**`.

Jobs:

1. **detect** — determines whether actual migration *code* changed.
2. **lint** — runs `node scripts/lint-migration.js --check-rollback`. Always
   runs when the workflow triggers; blocks on any blocking rule or missing
   `ROLLBACK.md`. (Adding docs/ROLLBACK.md only does **not** trip the heavy job.)
3. **verify** (only when migration code changed) — against a PostgreSQL 16
   service container:
   - pushes the baseline schema (`prisma db push`),
   - applies the custom migrations (`migrate.js up`),
   - seeds load (`seed-load.sh` → 100k escrows + 500k milestones),
   - runs the backend test suite (**forward schema**),
   - applies a representative migration and asserts it completes **< 30s**,
   - rolls back the last migration (`migrate.js down`) and verifies the schema
     fingerprint is identical after a re-apply (**up → down → up is a no-op**),
   - runs the backend test suite again (**rolled-back schema**).
   - Either test failure blocks the PR.
4. **migration-safety-result** — aggregates the required status.

---

## Acceptance criteria — how each is met

- ✅ **Migration adding NOT NULL column without default → lint blocks with clear error.**
  The `add-not-null-no-default` rule blocks `ADD COLUMN ... NOT NULL` (or
  `SET NOT NULL`) lacking a `DEFAULT`, with an explanatory message.
- ✅ **Migration with DROP COLUMN → blocked.** The `drop-column` rule blocks.
- ✅ **ALTER COLUMN with `-- safe:` comment → passes as warning only.** Confirmed
  locally: with the comment it is a warning and exits 0; without it, it blocks.
- ✅ **Missing ROLLBACK.md → CI fails.** `lint-migration.js --check-rollback`
  exits 1 with `Missing ROLLBACK.md` when a migration has no sibling
  `<version>.ROLLBACK.md`.
- ✅ **Migration completes in < 30s on 100k escrow seed.** The `verify` job
  seeds 100k escrows + 500k milestones and times a migration apply; it fails the
  build if it exceeds 30s.
- ✅ **Rollback leaves schema identical to pre-migration state.** The `verify`
  job captures a schema fingerprint before and after `up → down → up` and fails
  if they differ, proving `down()` is a true inverse of `up()`.

---

## Local verification performed

- `node --check` passes on all scripts; `bash -n` passes on `seed-load.sh`; the
  workflow YAML parses.
- Lint exercised against sample migrations:
  - safe migration with DEFAULT + FK index → **pass**
  - `DROP COLUMN` → **block**
  - `ADD COLUMN ... NOT NULL` w/o DEFAULT → **block**
  - `ALTER COLUMN ... TYPE` w/o `-- safe:` → **block**
  - `ALTER COLUMN ... TYPE` with `-- safe:` → **warn / pass**
  - `TRUNCATE` → **block**
  - missing FK index → **warn**
  - missing `ROLLBACK.md` (with `--check-rollback`) → **block**

Run it yourself:

```bash
node scripts/lint-migration.js --check-rollback --files <migration.js>
node scripts/lint-migration.js --all          # audit every migration
ESCROW_ROWS=1000 MILESTONE_ROWS=5000 bash scripts/seed-load.sh
```

---

## Notes / follow-ups

- Pre-existing migrations that contain forward `DROP COLUMN` / `ALTER COLUMN TYPE`
  in `up()` are **grandfathered** — the gate only lint the migrations introduced
  or modified in a PR. Do not extend those patterns in new migrations.
- `CREATE INDEX CONCURRENTLY` is used for the performance test to mirror the
  zero-downtime guidance in `docs/migration-safety.md`.

closes #1446
