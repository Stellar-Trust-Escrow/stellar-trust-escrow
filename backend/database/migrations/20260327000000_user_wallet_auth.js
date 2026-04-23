/**
 * Migration: Persist wallet addresses on users for API authorization
 * Version:   20260327000000_user_wallet_auth
 *
 * Adds:
 *   - wallet_address column on users
 *   - tenant-scoped uniqueness for wallet addresses
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS wallet_address TEXT
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_wallet_address_unique
    ON users (tenant_id, wallet_address)
    WHERE wallet_address IS NOT NULL
  `);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function down(prisma) {
  await prisma.$executeRawUnsafe(`
    DROP INDEX IF EXISTS idx_users_tenant_wallet_address_unique
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE users
    DROP COLUMN IF EXISTS wallet_address
  `);
}
