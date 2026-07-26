# Rollback: 20260528000000_escrow_partitioning

Migration: Add monthly escrow archive partitions

Reverts migration `20260528000000_escrow_partitioning.js`.

## Procedure

```bash
node backend/database/migrations/migrate.js down
```

## Inverse operations (from `down()`)

```js
const current = monthlyArchiveTableName();
  const next = monthlyArchiveTableName(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${current}`);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${next}`);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS escrow_partition_manifest`);
```

The Migration Safety CI verifies that `down()` is a true inverse of `up()`
(apply → rollback → re-apply leaves the schema byte-for-byte identical).
