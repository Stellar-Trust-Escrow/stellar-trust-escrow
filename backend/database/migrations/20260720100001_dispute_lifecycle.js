/**
 * Migration: Dispute lifecycle columns and rulings table
 * Version:   20260720100001_dispute_lifecycle
 *
 * Adds:
 *   - status, evidence_deadline_at, appeal_deadline_at, arbiter columns on disputes
 *   - dispute_rulings table
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE disputes
      ADD COLUMN IF NOT EXISTS status               TEXT NOT NULL DEFAULT 'open',
      ADD COLUMN IF NOT EXISTS evidence_deadline_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS appeal_deadline_at   TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS arbiter              TEXT
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS dispute_rulings (
      id               SERIAL PRIMARY KEY,
      dispute_id       INTEGER NOT NULL REFERENCES disputes(id),
      arbiter          TEXT    NOT NULL,
      client_pct       INTEGER NOT NULL,
      freelancer_pct   INTEGER NOT NULL,
      reasoning        TEXT    NOT NULL,
      ruled_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_dispute_rulings_dispute ON dispute_rulings(dispute_id)
  `);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
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
