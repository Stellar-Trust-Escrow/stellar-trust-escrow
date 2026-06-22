/**
 * Migration: Add ReputationEvent table for idempotent reputation updates
 * Version:   20260620000000_add_reputation_events
 *
 * Enables:
 *  - Audit trail of reputation score changes
 *  - Idempotent event processing (upsert on address, eventType, escrowId)
 *  - Score recalculation from event history for bug fixes
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function up(prisma) {
  // Create enum type for reputation event types
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReputationEventType') THEN
        CREATE TYPE "ReputationEventType" AS ENUM (
          'ESCROW_COMPLETED',
          'DISPUTE_WON',
          'DISPUTE_LOST',
          'CANCELLATION'
        );
      END IF;
    END $$
  `);

  // Create reputation_events table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS reputation_events (
      id          TEXT PRIMARY KEY,
      tenant_id   TEXT NOT NULL,
      address     TEXT NOT NULL,
      event_type  "ReputationEventType" NOT NULL,
      escrow_id   BIGINT,
      score_delta INT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      
      CONSTRAINT fk_reputation_event_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      CONSTRAINT fk_reputation_event_address FOREIGN KEY (address) REFERENCES reputation_records(address) ON DELETE CASCADE,
      CONSTRAINT uq_reputation_event UNIQUE (address, event_type, escrow_id)
    )
  `);

  // Create indexes
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS reputation_events_tenant_address_created_idx 
    ON reputation_events(tenant_id, address, created_at DESC)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS reputation_events_address_event_type_idx 
    ON reputation_events(address, event_type)
  `);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS reputation_events`);
  await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "ReputationEventType"`);
}
