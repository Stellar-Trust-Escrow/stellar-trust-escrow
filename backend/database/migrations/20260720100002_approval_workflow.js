/**
 * Migration: N-of-M off-chain approval workflow tables
 * Version:   20260720100002_approval_workflow
 *
 * Adds:
 *   - approval_requests  — tracks each pending approval round for a milestone
 *   - approval_records   — individual approver decisions (approved | rejected)
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS approval_requests (
      id                  TEXT PRIMARY KEY,
      escrow_id           TEXT NOT NULL,
      milestone_index     INTEGER NOT NULL,
      required_approvers  TEXT[] NOT NULL,
      threshold           INTEGER NOT NULL,
      approval_count      INTEGER NOT NULL DEFAULT 0,
      status              TEXT NOT NULL DEFAULT 'pending',
      initiated_by        TEXT NOT NULL,
      deadline_at         TIMESTAMPTZ NOT NULL,
      tx_hash             TEXT,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_approval_requests_escrow ON approval_requests(escrow_id)`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status)`,
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS approval_records (
      id                TEXT PRIMARY KEY,
      request_id        TEXT NOT NULL REFERENCES approval_requests(id),
      approver_address  TEXT NOT NULL,
      signature_proof   TEXT NOT NULL,
      decision          TEXT NOT NULL,
      reason            TEXT,
      recorded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(request_id, approver_address)
    )
  `);

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_approval_records_request ON approval_records(request_id)`,
  );
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS approval_records`);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS approval_requests`);
}
