/**
 * Migration: Add webhook subscriptions and deliveries
 * Version:   20260528000000_webhooks
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function up(prisma) {
  // Guard: if prisma db push already applied the final schema (webhook_endpoints),
  // skip creating webhook_subscriptions to avoid the rename conflict in the next migration.
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'webhook_endpoints'
      ) THEN
        CREATE TABLE IF NOT EXISTS webhook_subscriptions (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          url TEXT NOT NULL,
          secret TEXT NOT NULL,
          event_types TEXT[] NOT NULL DEFAULT '{}',
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_by TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT fk_webhook_subscription_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS webhook_subscriptions_tenant_id_idx ON webhook_subscriptions(tenant_id);
        CREATE INDEX IF NOT EXISTS webhook_subscriptions_created_by_idx ON webhook_subscriptions(created_by);
      END IF;
    END $$
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id TEXT PRIMARY KEY,
      subscription_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INT NOT NULL DEFAULT 0,
      response_code INT,
      error_message TEXT,
      last_attempt_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT fk_webhook_delivery_subscription FOREIGN KEY (subscription_id) REFERENCES webhook_subscriptions(id) ON DELETE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'webhook_deliveries' AND column_name = 'subscription_id'
      ) THEN
        CREATE INDEX IF NOT EXISTS webhook_deliveries_subscription_id_idx
          ON webhook_deliveries(subscription_id);
      END IF;
    END $$
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS webhook_deliveries_event_type_idx ON webhook_deliveries(event_type)
  `);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS webhook_deliveries`);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS webhook_subscriptions`);
}
