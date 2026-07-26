/**
 * Migration: Rename webhook subscriptions to endpoints and extend deliveries
 * Version:   20260717000000_webhook_endpoints
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function up(prisma) {
  // Rename table — no-op if webhook_subscriptions doesn't exist (prisma db push
  // already created webhook_endpoints directly from the final schema).
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'webhook_subscriptions'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'webhook_endpoints'
      ) THEN
        ALTER TABLE webhook_subscriptions RENAME TO webhook_endpoints;
      END IF;
    END $$
  `);

  // Rename column — no-op if already renamed (prisma db push applied final schema).
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'webhook_deliveries' AND column_name = 'subscription_id'
      ) THEN
        ALTER TABLE webhook_deliveries RENAME COLUMN subscription_id TO endpoint_id;
      END IF;
    END $$
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE webhook_deliveries
      ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS response_body TEXT
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE webhook_deliveries
      DROP COLUMN IF EXISTS error_message,
      DROP COLUMN IF EXISTS last_attempt_at
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS webhook_deliveries_status_idx ON webhook_deliveries(status)
  `);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function down(prisma) {
  await prisma.$executeRawUnsafe(`
    DROP INDEX IF EXISTS webhook_deliveries_status_idx
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE webhook_deliveries
      ADD COLUMN IF NOT EXISTS error_message TEXT,
      ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE webhook_deliveries
      DROP COLUMN IF EXISTS next_retry_at,
      DROP COLUMN IF EXISTS response_body
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE webhook_deliveries
      RENAME COLUMN endpoint_id TO subscription_id
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE IF EXISTS webhook_endpoints RENAME TO webhook_subscriptions
  `);
}
