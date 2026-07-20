/**
 * Migration: CQRS write model + exactly-once indexer support
 * Version:   20260718000000_escrow_write_model_and_indexer
 *
 * Supports the rebuilt escrow pipeline:
 *  - services/escrowService (CQRS command handlers) emits the full lifecycle
 *    vocabulary, so the EscrowStatus enum gains Draft / Funded / InProgress /
 *    ReleaseRequested / Resolved / Released / Expired.
 *  - services/escrowIndexer records every contract event exactly once, keyed by
 *    the globally-unique Soroban event id (contract_events.event_id).
 *  - A compensation log (failed_events) captures domain events that could not be
 *    published after a committed DB write.
 */

const NEW_ESCROW_STATUSES = [
  'Draft',
  'Funded',
  'InProgress',
  'ReleaseRequested',
  'Resolved',
  'Released',
  'Expired',
];

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function up(prisma) {
  // 1. Extend the EscrowStatus enum with the full lifecycle vocabulary.
  //    Each ADD VALUE runs as its own statement; PG 12+ permits ADD VALUE inside
  //    a transaction, and the new labels are not yet referenced by any column
  //    default in this migration, so there is no "unsafe new enum value" error.
  for (const status of NEW_ESCROW_STATUSES) {
    await prisma.$executeRawUnsafe(`ALTER TYPE "EscrowStatus" ADD VALUE IF NOT EXISTS '${status}'`);
  }

  // 2. Exactly-once idempotency key for contract events.
  // Use TEXT NOT NULL (matching Prisma's String mapping) with a temporary DEFAULT
  // so existing rows satisfy the NOT NULL constraint, then drop the default to
  // match the schema fingerprint produced by prisma db push.
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'contract_events' AND column_name = 'event_id'
      ) THEN
        ALTER TABLE "contract_events" ADD COLUMN "event_id" TEXT NOT NULL DEFAULT '';
        ALTER TABLE "contract_events" ALTER COLUMN "event_id" DROP DEFAULT;
      END IF;
    END $$
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "contract_events_event_id_key"
      ON "contract_events" ("event_id")
  `);

  // 3. Compensation log for failed domain-event publication.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "failed_events" (
      "id"         SERIAL PRIMARY KEY,
      "tenant_id"  TEXT NOT NULL,
      "event_type" TEXT NOT NULL,
      "payload"    JSONB NOT NULL,
      "error"      TEXT,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "failed_events_tenant_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE RESTRICT
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "failed_events_tenant_id_idx" ON "failed_events" ("tenant_id")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "failed_events_event_type_idx" ON "failed_events" ("event_type")
  `);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "failed_events"`);
  await prisma.$executeRawUnsafe(`
    DROP INDEX IF EXISTS "contract_events_event_id_key"
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "contract_events" DROP COLUMN IF EXISTS "event_id"
  `);
  // Enum values cannot be removed without recreating the type; left in place as
  // they are backward-compatible additions.
}
