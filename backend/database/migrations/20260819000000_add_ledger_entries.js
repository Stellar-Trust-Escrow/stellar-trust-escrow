/**
 * Migration: Double-entry escrow settlement ledger
 * Version:   20260819000000_add_ledger_entries
 *
 * Adds the `ledger_entries` table that underpins the double-entry accounting
 * model.  Every fund movement (funding, release, refund, fee collection,
 * penalty, or manual adjustment) is recorded as an atomic pair of rows —
 * one Debit and one Credit — within the same Prisma transaction that mutates
 * the escrow's `remaining_balance`.
 *
 * Invariant enforced at the application layer (LedgerService.verifyBalance):
 *   SUM(amount WHERE direction='Debit') == SUM(amount WHERE direction='Credit')
 *   for every escrow_id at all times.
 *
 * Rows are INSERT-only — no UPDATE or DELETE may ever touch this table.
 *
 * Performance notes
 * ─────────────────
 * The reconciliation report endpoint aggregates up to 1 M rows by
 * (escrow_id, created_at, entry_type, direction).  Two composite indexes cover
 * the dominant query shapes:
 *   1. ledger_entries_escrow_created_idx  — per-escrow paginated listing
 *   2. ledger_entries_reconcile_idx       — global date-range aggregate
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function up(prisma) {
  // 1. Enum types — guard with IF NOT EXISTS via PG DO block.
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LedgerAccountType') THEN
        CREATE TYPE "LedgerAccountType" AS ENUM (
          'Escrow',
          'Buyer',
          'Seller',
          'Platform',
          'Arbiter'
        );
      END IF;
    END $$
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LedgerDirection') THEN
        CREATE TYPE "LedgerDirection" AS ENUM ('Debit', 'Credit');
      END IF;
    END $$
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LedgerEntryType') THEN
        CREATE TYPE "LedgerEntryType" AS ENUM (
          'Fund',
          'Release',
          'Refund',
          'Fee',
          'Penalty',
          'Adjustment'
        );
      END IF;
    END $$
  `);

  // 2. Create the table.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ledger_entries" (
      "id"           TEXT         NOT NULL,
      "tenant_id"    TEXT         NOT NULL,
      "escrow_id"    BIGINT       NOT NULL,
      "account_type" "LedgerAccountType" NOT NULL,
      "direction"    "LedgerDirection"   NOT NULL,
      "amount"       TEXT         NOT NULL,
      "currency"     TEXT         NOT NULL DEFAULT 'XLM',
      "entry_type"   "LedgerEntryType"   NOT NULL,
      "reference_id" TEXT         NOT NULL,
      "created_at"   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "ledger_entries_tenant_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "ledger_entries_escrow_fkey"
        FOREIGN KEY ("escrow_id") REFERENCES "escrows" ("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `);

  // 3. Indexes.
  // Covers: GET /api/v1/escrows/:id/ledger  (paginated, sorted desc)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ledger_entries_escrow_created_idx"
      ON "ledger_entries" ("escrow_id", "created_at" DESC)
  `);

  // Covers: GET /api/v1/admin/reconciliation-report  (global date-range aggregate)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ledger_entries_reconcile_idx"
      ON "ledger_entries" ("created_at" DESC, "entry_type", "direction")
  `);

  // Covers: verifyBalance per-escrow sum queries
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ledger_entries_tenant_escrow_idx"
      ON "ledger_entries" ("tenant_id", "escrow_id")
  `);

  // Covers: account-level analytics
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ledger_entries_account_direction_idx"
      ON "ledger_entries" ("account_type", "direction")
  `);

  // 4. Indexes matching prisma/schema.prisma's @@index declarations for this
  //    model. schema.prisma is pushed once at the start of the migration
  //    history (via `prisma db push`) and creates these under Prisma's own
  //    naming convention; because DROP TABLE (in down()) removes them along
  //    with everything else, they must also be recreated here so that a
  //    rollback + reapply of just this migration is self-contained.
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ledger_entries_escrow_id_created_at_idx"
      ON "ledger_entries" ("escrow_id", "created_at" DESC)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ledger_entries_tenant_id_escrow_id_idx"
      ON "ledger_entries" ("tenant_id", "escrow_id")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ledger_entries_account_type_direction_idx"
      ON "ledger_entries" ("account_type", "direction")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ledger_entries_entry_type_idx"
      ON "ledger_entries" ("entry_type")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ledger_entries_created_at_idx"
      ON "ledger_entries" ("created_at" DESC)
  `);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "ledger_entries"`);
  await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "LedgerEntryType"`);
  await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "LedgerDirection"`);
  await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "LedgerAccountType"`);
}
