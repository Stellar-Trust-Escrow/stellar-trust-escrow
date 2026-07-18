# Migration Safety

This document describes the migration safety gate that protects the database
from downtime-causing or data-loss-prone schema changes, and how to write
migrations that pass it.

> **Repository note:** this project uses a custom, JS-based migration system
> (`backend/database/migrations/*.js` exporting `up(prisma)` / `down(prisma)`)
> rather than standard Prisma SQL migrations. The safety tooling below is
> adapted to that system while preserving the intent of the original spec
> (which referenced `prisma/migrations/`). Both `backend/database/migrations/**`
> and `prisma/migrations/**` are scanned.

## What is enforced

A dedicated workflow, `.github/workflows/migration-safety.yml`, runs on every
PR that touches migration files. It performs three things:

1. **Lint gate** — scans new/changed migration files for unsafe patterns and
   blocks the PR on any blocking issue. See
   [`scripts/lint-migration.js`](../scripts/lint-migration.js).
2. **Apply / rollback / test** (only when migration *code* changed) — applies
   the migrations to a real PostgreSQL service container, runs the backend test
   suite against the migrated schema, rolls the last migration back, runs the
   suite again against the previous schema, and verifies the schema is
   byte-for-byte identical before/after rollback. Either test failure blocks
   the PR.
3. **Performance gate** — seeds the database with production-like volume
   (100k escrows + 500k milestones via [`scripts/seed-load.sh`](../scripts/seed-load.sh))
   and asserts a representative migration applies in **under 30 seconds**.

## Lint rules

The linter extracts the `up()` body of each migration (or the whole file for
`.sql` migrations) and checks the SQL it runs.

| Pattern                              | Risk              | Action                                             |
| ------------------------------------ | ----------------- | -------------------------------------------------- |
| `DROP COLUMN`                        | Data loss         | **Block** (exit 1)                                 |
| `DROP TABLE`                         | Data loss         | **Block** (exit 1)                                 |
| `TRUNCATE`                          | Data loss         | **Block** (exit 1)                                 |
| `ADD COLUMN ... NOT NULL` w/o DEFAULT| Lock + failures   | **Block** (exit 1)                                 |
| `ALTER COLUMN ... SET NOT NULL` w/o DEFAULT | Lock + failures | **Block** (exit 1)                          |
| `ALTER COLUMN ... TYPE`              | Table rewrite/lock| **Block** unless a `-- safe:` justification comment is present (then **Warn** only) |
| Missing index on FK-like columns     | N+1 / seq scans   | **Warn**                                           |

Outputs a human-readable summary plus a machine-readable
`migration-lint-report.json`.

Run it locally:

```bash
# Lint only the migrations changed vs the base branch
node scripts/lint-migration.js --check-rollback

# Lint specific files
node scripts/lint-migration.js --files backend/database/migrations/2026xxxx_my_change.js

# Audit every migration (informational — pre-existing migrations are exempt in CI)
node scripts/lint-migration.js --all
```

### The `-- safe:` escape hatch

`ALTER COLUMN ... TYPE` is allowed **only** when the migration file contains a
justification comment of the form:

```js
// safe: column has no rows in prod yet, internal single-tenant table
export async function up(prisma) {
  await prisma.$executeRawUnsafe(`ALTER TABLE widgets ALTER COLUMN amount TYPE BIGINT`);
}
```

Without the comment the linter blocks the PR so the lock is at least reviewed.

## ROLLBACK.md requirement

Every migration **must** ship a rollback plan. For this repo's JS migrations
that means a sibling file named `<version>.ROLLBACK.md` next to
`<version>.js` (e.g. `20260620000000_add_reputation_events.ROLLBACK.md`).
For standard Prisma SQL migrations it is `prisma/migrations/<name>/ROLLBACK.md`.

The CI blocks with `Missing ROLLBACK.md` when a new or modified migration lacks
one. Existing migrations already implement reversible `down()` functions and are
grandfathered; the requirement applies to all migrations going forward.

A minimal `ROLLBACK.md`:

```markdown
# Rollback: add_reputation_events

Reverts migration `20260620000000_add_reputation_events.js`.

## Procedure
\`\`\`bash
node backend/database/migrations/migrate.js down
\`\`\`

## Inverse operations
- Drops the `reputation_events` table.
- Removes the `reputation_records` columns added by this migration.
```

## Zero-downtime checklist

The PR template includes a **Migration checklist** that must be completed for any
migration PR:

- [ ] Migration is backward-compatible with the previous version of the app code
- [ ] New NOT NULL columns have a DEFAULT or are added in a separate migration after backfill
- [ ] No table locks held for more than 100ms at expected table sizes
- [ ] Rollback plan documented below

### Patterns that keep migrations online

- **Add columns as `NULL`, then backfill, then `SET NOT NULL`** in a later
  migration (or add `DEFAULT` so Postgres can avoid a full rewrite).
- **Prefer `ADD COLUMN ... DEFAULT`** over changing an existing column's type.
- **Create indexes `CONCURRENTLY`** to avoid blocking writes (note: `CONCURRENTLY`
  cannot run inside a transaction — apply it in its own migration step).
- **Never `DROP COLUMN` / `DROP TABLE` / `TRUNCATE` in a forward migration**;
  if retiring a column, rename it / make it unused first and drop in a later,
  explicitly reviewed migration.
- **Index foreign-key columns** (`*_id`, `*Id`) to avoid sequential scans on
  joins and lookups.

## Performance gate

`scripts/seed-load.sh` inserts 100,000 escrows and 500,000 milestones (5 per
escrow) into the migrated schema. Override volumes with `ESCROW_ROWS` /
`MILESTONE_ROWS`. The CI then applies a representative migration and asserts it
completes in under 30 seconds on that dataset.

```bash
ESCROW_ROWS=1000 MILESTONE_ROWS=5000 bash scripts/seed-load.sh
```

## Local dry-run of the full gate

```bash
# 1. Lint changed migrations + verify ROLLBACK.md presence
node scripts/lint-migration.js --check-rollback

# 2. (Optional) stand up a local Postgres, then:
npm run db:generate -w backend
npx prisma db push --schema=backend/database/schema.prisma --accept-data-loss
node backend/database/migrations/migrate.js up
bash scripts/seed-load.sh
node backend/database/migrations/migrate.js up   # time this
node backend/database/migrations/migrate.js down # verify rollback
node scripts/schema-fingerprint.js               # compare before/after
```
