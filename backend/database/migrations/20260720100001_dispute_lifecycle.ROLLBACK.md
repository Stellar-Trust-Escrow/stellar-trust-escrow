## Rollback: dispute_lifecycle

```js
export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS dispute_rulings`);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE disputes
      DROP COLUMN IF EXISTS status,
      DROP COLUMN IF EXISTS evidence_deadline_at,
      DROP COLUMN IF EXISTS appeal_deadline_at,
      DROP COLUMN IF EXISTS arbiter
  `);
}
```

The Migration Safety CI verifies that `down()` is a true inverse of `up()`
