# Rollback: 20260819000000_add_ledger_entries

## What this migration does

Adds the `ledger_entries` table and three supporting enum types
(`LedgerAccountType`, `LedgerDirection`, `LedgerEntryType`) for the
double-entry escrow settlement ledger.

## Rollback procedure

Run `down(prisma)` from this migration file.  That drops:

1. The `ledger_entries` table (and all its indexes via CASCADE).
2. The three enum types.

> **Warning:** dropping `ledger_entries` is **irreversible** — all recorded
> fund-movement history will be permanently lost.  Take a full database backup
> before rolling back in production.

## Steps

```bash
# 1. Back up the database
pg_dump $DATABASE_URL > backup_before_rollback_ledger.sql

# 2. Run the rollback
node backend/database/migrations/migrate.js down 20260819000000_add_ledger_entries
```
