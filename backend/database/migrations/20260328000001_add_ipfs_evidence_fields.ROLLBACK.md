# Rollback: 20260328000001_add_ipfs_evidence_fields

Migration: Add IPFS evidence fields

Reverts migration `20260328000001_add_ipfs_evidence_fields.js`.

## Procedure

```bash
node backend/database/migrations/migrate.js down
```

## Inverse operations (from `down()`)

```js
await prisma.$executeRawUnsafe(`
    DROP INDEX IF EXISTS dispute_evidence_ipfs_cid_idx
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE dispute_evidence
      DROP COLUMN IF EXISTS filename,
      DROP COLUMN IF EXISTS mime_type,
      DROP COLUMN IF EXISTS file_size,
      DROP COLUMN IF EXISTS ipfs_cid,
      DROP COLUMN IF EXISTS thumbnail_cid,
      DROP COLUMN IF EXISTS scan_status,
      DROP COLUMN IF EXISTS scan_result
  `);
```

The Migration Safety CI verifies that `down()` is a true inverse of `up()`
(apply → rollback → re-apply leaves the schema byte-for-byte identical).
