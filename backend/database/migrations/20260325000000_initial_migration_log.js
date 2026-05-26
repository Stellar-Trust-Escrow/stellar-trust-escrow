/**
 * Migration: Add migration log table and initial indexes
 * Version:   20260325000000_initial_migration_log
 *
 * This is the baseline migration. Prisma already manages the schema via
 * prisma/migrations — this file handles supplemental DDL that Prisma
 * doesn't cover (e.g. partial indexes, custom functions, migration log).
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function up(prisma) {
  // Partial index: only index active escrows for dashboard queries
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_escrows_active_created
    ON escrows (created_at DESC)
    WHERE status = 'Active'
  `);

  // Partial index: unresolved disputes only
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_disputes_unresolved
    ON disputes (raised_at DESC)
    WHERE resolved_at IS NULL
  `);

  // Partial index: pending KYC verifications
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_kyc_pending
    ON kyc_verifications (created_at DESC)
    WHERE status = 'Pending'
  `);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS idx_escrows_active_created`);
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS idx_disputes_unresolved`);
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS idx_kyc_pending`);
}
