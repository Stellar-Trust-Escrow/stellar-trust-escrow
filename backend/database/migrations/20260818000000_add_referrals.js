/**
 * Migration: Add referral_codes and referral_earnings tables
 * Version:   20260818000000_add_referrals
 *
 * Enables:
 *  - Off-chain accounting for the on-chain referral_registry contract
 *  - Fee-split earning records per (referral_code, escrow_id, trigger event)
 *  - Batch payout tracking (paid_out / paid_out_at)
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReferralTriggerEvent') THEN
        CREATE TYPE "ReferralTriggerEvent" AS ENUM ('release', 'completion');
      END IF;
    END $$
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS referral_codes (
      code              TEXT PRIMARY KEY,
      referrer_user_id  INTEGER NOT NULL,
      total_referrals   INTEGER NOT NULL DEFAULT 0,
      total_earned_xlm  DECIMAL(20,7) NOT NULL DEFAULT 0,
      created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT fk_referral_code_user FOREIGN KEY (referrer_user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS referral_earnings (
      id                  TEXT PRIMARY KEY,
      referral_code       TEXT NOT NULL,
      escrow_id           BIGINT NOT NULL,
      triggered_by_event  "ReferralTriggerEvent" NOT NULL,
      earned_xlm          DECIMAL(20,7) NOT NULL,
      paid_out            BOOLEAN NOT NULL DEFAULT FALSE,
      paid_out_at         TIMESTAMP,
      created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT fk_referral_earning_code FOREIGN KEY (referral_code) REFERENCES referral_codes(code) ON DELETE CASCADE,
      CONSTRAINT referral_earnings_referral_code_escrow_id_triggered_by_even_key UNIQUE (referral_code, escrow_id, triggered_by_event)
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS referral_codes_referrer_user_id_idx
    ON referral_codes(referrer_user_id)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS referral_earnings_referral_code_idx
    ON referral_earnings(referral_code)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS referral_earnings_paid_out_idx
    ON referral_earnings(paid_out)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS referral_earnings_escrow_id_idx
    ON referral_earnings(escrow_id)
  `);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS referral_earnings`);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS referral_codes`);
  await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "ReferralTriggerEvent"`);
}
