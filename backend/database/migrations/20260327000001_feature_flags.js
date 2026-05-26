/**
 * Migration: Feature Flags table
 * Version:   20260327000001_feature_flags
 */

/** @param {import('@prisma/client').PrismaClient} prisma */
export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS feature_flags (
      key          TEXT        PRIMARY KEY,
      is_enabled   BOOLEAN     NOT NULL DEFAULT FALSE,
      percentage   INTEGER     NOT NULL DEFAULT 0 CHECK (percentage BETWEEN 0 AND 100),
      target_users TEXT[]      NOT NULL DEFAULT '{}',
      description  TEXT        NOT NULL DEFAULT '',
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/** @param {import('@prisma/client').PrismaClient} prisma */
export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS feature_flags`);
}
