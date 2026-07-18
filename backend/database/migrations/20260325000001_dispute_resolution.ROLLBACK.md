# Rollback: 20260325000001_dispute_resolution

Migration: Automated dispute resolution tables

Reverts migration `20260325000001_dispute_resolution.js`.

## Procedure

```bash
node backend/database/migrations/migrate.js down
```

## Inverse operations (from `down()`)

```js
await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS dispute_appeals`);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS dispute_evidence`);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE disputes
      DROP COLUMN IF EXISTS resolution_type,
      DROP COLUMN IF EXISTS auto_resolved
  `);
```

The Migration Safety CI verifies that `down()` is a true inverse of `up()`
(apply → rollback → re-apply leaves the schema byte-for-byte identical).
