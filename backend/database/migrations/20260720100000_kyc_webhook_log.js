/**
 * Migration: KYC webhook log table
 * Version:   20260720100000_kyc_webhook_log
 *
 * Adds a dedicated audit table for Sumsub webhook events so that every
 * incoming webhook call is persisted for debugging, replay, and compliance.
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS kyc_webhook_logs (
      id            SERIAL PRIMARY KEY,
      applicant_id  TEXT NOT NULL,
      event_type    TEXT NOT NULL,
      raw_payload   JSONB NOT NULL,
      processed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_kyc_webhook_logs_applicant
      ON kyc_webhook_logs(applicant_id)
  `);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS kyc_webhook_logs`);
}
