/**
 * Migration: Automated dispute resolution tables
 * Version:   20260325000001_dispute_resolution
 *
 * Adds:
 *   - dispute_evidence  — evidence submitted by parties
 *   - dispute_appeals   — appeal records for resolved disputes
 *   - resolution_type / auto_resolved columns on disputes
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function up(prisma) {
  // Add new columns to disputes
  await prisma.$executeRawUnsafe(`
    ALTER TABLE disputes
      ADD COLUMN IF NOT EXISTS resolution_type TEXT,
      ADD COLUMN IF NOT EXISTS auto_resolved   BOOLEAN NOT NULL DEFAULT FALSE
  `);

  // Evidence table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS dispute_evidence (
      id            SERIAL PRIMARY KEY,
      dispute_id    INTEGER NOT NULL REFERENCES disputes(id),
      submitted_by  TEXT    NOT NULL,
      role          TEXT    NOT NULL,
      evidence_type TEXT    NOT NULL,
      content       TEXT    NOT NULL,
      description   TEXT,
      submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_dispute_evidence_dispute_id ON dispute_evidence (dispute_id)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_dispute_evidence_submitted_by ON dispute_evidence (submitted_by)
  `);

  // Appeals table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS dispute_appeals (
      id            SERIAL PRIMARY KEY,
      dispute_id    INTEGER NOT NULL REFERENCES disputes(id),
      appealed_by   TEXT    NOT NULL,
      reason        TEXT    NOT NULL,
      status        TEXT    NOT NULL DEFAULT 'pending',
      reviewed_by   TEXT,
      review_notes  TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at   TIMESTAMPTZ
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_dispute_appeals_dispute_id ON dispute_appeals (dispute_id)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_dispute_appeals_status ON dispute_appeals (status)
  `);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS dispute_appeals`);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS dispute_evidence`);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE disputes
      DROP COLUMN IF EXISTS resolution_type,
      DROP COLUMN IF EXISTS auto_resolved
  `);
}
