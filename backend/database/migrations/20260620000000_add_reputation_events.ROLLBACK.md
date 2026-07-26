# Rollback: 20260620000000_add_reputation_events

Migration: Add ReputationEvent table for idempotent reputation updates

Reverts migration `20260620000000_add_reputation_events.js`.

## Procedure

```bash
node backend/database/migrations/migrate.js down
```

## Inverse operations (from `down()`)

```js
await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS reputation_events`);
  await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "ReputationEventType"`);
```

The Migration Safety CI verifies that `down()` is a true inverse of `up()`
(apply → rollback → re-apply leaves the schema byte-for-byte identical).
