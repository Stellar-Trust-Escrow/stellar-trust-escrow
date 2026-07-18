# Rollback: 20260330000000_add_wallet_address_and_indexes

Migration: add wallet_address to users + composite indexes for hot query paths

Reverts migration `20260330000000_add_wallet_address_and_indexes.js`.

## Procedure

```bash
node backend/database/migrations/migrate.js down
```

## Inverse operations (from `down()`)

```js
await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS users_tenant_email_idx`);
  await prisma.$executeRawUnsafe(`ALTER TABLE users DROP COLUMN IF EXISTS wallet_address`);
```

The Migration Safety CI verifies that `down()` is a true inverse of `up()`
(apply → rollback → re-apply leaves the schema byte-for-byte identical).
