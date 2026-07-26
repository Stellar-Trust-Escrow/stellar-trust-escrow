/**
 * Migration: Add arbiter fields to ReputationRecord and dispute escalation fields to Dispute
 * Version:   20260717000000_add_arbiter_and_dispute_fields
 *
 * Enables:
 *  - Arbiter registration and management
 *  - Dispute escalation tracking
 *  - Auto-escalation timestamp
 *  - Current arbiter assignment
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function up(prisma) {
  // Add arbiter fields to reputation_records table
  await prisma.$executeRawUnsafe(`
    ALTER TABLE reputation_records 
    ADD COLUMN IF NOT EXISTS is_arbiter BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS active_disputes INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_resolved INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);

  // Add index for is_arbiter
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS reputation_records_is_arbiter_idx 
    ON reputation_records(is_arbiter)
  `);

  // Add dispute escalation fields to disputes table
  await prisma.$executeRawUnsafe(`
    ALTER TABLE disputes 
    ADD COLUMN IF NOT EXISTS escalation_count INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS auto_escalate_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS current_arbiter TEXT
  `);

  // Add indexes for new dispute fields
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS disputes_current_arbiter_idx 
    ON disputes(current_arbiter)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS disputes_auto_escalate_at_idx 
    ON disputes(auto_escalate_at)
  `);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function down(prisma) {
  // Remove indexes first
  await prisma.$executeRawUnsafe(`
    DROP INDEX IF EXISTS reputation_records_is_arbiter_idx
  `);
  await prisma.$executeRawUnsafe(`
    DROP INDEX IF EXISTS disputes_current_arbiter_idx
  `);
  await prisma.$executeRawUnsafe(`
    DROP INDEX IF EXISTS disputes_auto_escalate_at_idx
  `);

  // Remove columns from reputation_records
  await prisma.$executeRawUnsafe(`
    ALTER TABLE reputation_records 
    DROP COLUMN IF EXISTS is_arbiter,
    DROP COLUMN IF EXISTS active_disputes,
    DROP COLUMN IF EXISTS total_resolved,
    DROP COLUMN IF EXISTS created_at
  `);

  // Remove columns from disputes
  await prisma.$executeRawUnsafe(`
    ALTER TABLE disputes 
    DROP COLUMN IF EXISTS escalation_count,
    DROP COLUMN IF EXISTS auto_escalate_at,
    DROP COLUMN IF EXISTS current_arbiter
  `);
}
