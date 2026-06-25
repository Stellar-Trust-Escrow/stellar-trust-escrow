/**
 * Migration: Add family_id and used columns to refresh_tokens
 *
 * family_id  — groups all tokens issued from the same original login.
 *              When reuse is detected, the whole family is revoked.
 * used       — marks a token as consumed; a used token presented again
 *              triggers family revocation (reuse detection).
 */

export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE refresh_tokens
      ADD COLUMN IF NOT EXISTS family_id TEXT,
      ADD COLUMN IF NOT EXISTS used BOOLEAN NOT NULL DEFAULT FALSE
  `);

  // Backfill: assign each existing token its own family
  await prisma.$executeRawUnsafe(`
    UPDATE refresh_tokens SET family_id = id WHERE family_id IS NULL
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family_id ON refresh_tokens(family_id)
  `);
}

export async function down(prisma) {
  await prisma.$executeRawUnsafe(`
    DROP INDEX IF EXISTS idx_refresh_tokens_family_id
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE refresh_tokens
      DROP COLUMN IF EXISTS family_id,
      DROP COLUMN IF EXISTS used
  `);
}
