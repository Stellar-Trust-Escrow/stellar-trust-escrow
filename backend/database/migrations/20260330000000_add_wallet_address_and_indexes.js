/**
 * Migration: add wallet_address to users + composite indexes for hot query paths
 *
 * Changes:
 *  - users.wallet_address (nullable, unique) — referenced by auth and dispute access flows
 *  - index users(tenant_id, email) — covers login query (findFirst by tenantId+email)
 */

export const version = '20260330000000';
export const name = 'add_wallet_address_and_indexes';

export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS wallet_address TEXT UNIQUE
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS users_tenant_email_idx
      ON users (tenant_id, email)
  `);
}

export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS users_tenant_email_idx`);
  await prisma.$executeRawUnsafe(`ALTER TABLE users DROP COLUMN IF EXISTS wallet_address`);
}
