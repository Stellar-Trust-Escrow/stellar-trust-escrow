/**
 * Migration: Add escalation tracking columns to disputes table
 *
 * escalated_at       — timestamp of last escalation; NULL means never escalated
 * escalation_count   — number of times this dispute has been escalated
 */

export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE disputes
      ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS escalation_count INTEGER NOT NULL DEFAULT 0
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_disputes_escalated_at ON disputes(escalated_at)
  `);
}

export async function down(prisma) {
  await prisma.$executeRawUnsafe(`
    DROP INDEX IF EXISTS idx_disputes_escalated_at
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE disputes
      DROP COLUMN IF EXISTS escalated_at,
      DROP COLUMN IF EXISTS escalation_count
  `);
}
