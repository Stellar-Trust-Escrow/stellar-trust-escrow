## Rollback: approval_workflow

```js
export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS approval_records`);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS approval_requests`);
}
```

The Migration Safety CI verifies that `down()` is a true inverse of `up()`
