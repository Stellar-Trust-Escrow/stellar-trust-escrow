# Rollback: 20260325000000_initial_migration_log

Migration: Add migration log table and initial indexes

Reverts migration `20260325000000_initial_migration_log.js`.

## Procedure

```bash
node backend/database/migrations/migrate.js down
```

## Inverse operations (from `down()`)

```js
await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS idx_escrows_active_created`);
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS idx_disputes_unresolved`);
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS idx_kyc_pending`);
```

The Migration Safety CI verifies that `down()` is a true inverse of `up()`
(apply → rollback → re-apply leaves the schema byte-for-byte identical).
