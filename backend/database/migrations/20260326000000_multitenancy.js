/**
 * Migration: Multi-tenant data isolation
 * Version:   20260326000000_multitenancy
 *
 * Adds:
 *   - tenants table
 *   - tenant_id columns across tenant-owned tables
 *   - default tenant bootstrap + backfill for existing rows
 *   - tenant-aware indexes for common query paths
 */

const DEFAULT_TENANT_ID = 'tenant_default';

const TENANT_TABLES = [
  'users',
  'escrows',
  'milestones',
  'reputation_records',
  'disputes',
  'dispute_evidence',
  'dispute_appeals',
  'user_profiles',
  'contract_events',
  'payments',
  'kyc_verifications',
  'admin_audit_logs',
  'audit_logs',
];

const TENANT_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_users_tenant_created_at ON users (tenant_id, created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_escrows_tenant_status_created_at ON escrows (tenant_id, status, created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_escrows_tenant_client_created_at ON escrows (tenant_id, client_address, created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_escrows_tenant_freelancer_created_at ON escrows (tenant_id, freelancer_address, created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_milestones_tenant_escrow ON milestones (tenant_id, escrow_id)',
  'CREATE INDEX IF NOT EXISTS idx_reputation_records_tenant_total_score ON reputation_records (tenant_id, total_score DESC)',
  'CREATE INDEX IF NOT EXISTS idx_disputes_tenant_resolved_raised ON disputes (tenant_id, resolved_at, raised_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_dispute_evidence_tenant_dispute ON dispute_evidence (tenant_id, dispute_id)',
  'CREATE INDEX IF NOT EXISTS idx_dispute_appeals_tenant_dispute ON dispute_appeals (tenant_id, dispute_id)',
  'CREATE INDEX IF NOT EXISTS idx_user_profiles_tenant_updated_at ON user_profiles (tenant_id, updated_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_contract_events_tenant_ledger_at ON contract_events (tenant_id, ledger_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_payments_tenant_address_created_at ON payments (tenant_id, address, created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_kyc_verifications_tenant_status ON kyc_verifications (tenant_id, status)',
  'CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_tenant_performed_at ON admin_audit_logs (tenant_id, performed_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created_at ON audit_logs (tenant_id, created_at DESC)',
];

async function addTenantColumn(prisma, table) {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE ${table}
    ADD COLUMN IF NOT EXISTS tenant_id TEXT
  `);

  await prisma.$executeRawUnsafe(
    `UPDATE ${table} SET tenant_id = $1 WHERE tenant_id IS NULL`,
    DEFAULT_TENANT_ID,
  );

  await prisma.$executeRawUnsafe(`
    ALTER TABLE ${table}
    ALTER COLUMN tenant_id SET NOT NULL
  `);

  const constraintName = `${table}_tenant_id_fkey`;

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = '${constraintName}'
      ) THEN
        ALTER TABLE ${table}
        ADD CONSTRAINT ${constraintName}
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT;
      END IF;
    END $$;
  `);
}

async function dropTenantColumn(prisma, table) {
  const constraintName = `${table}_tenant_id_fkey`;

  await prisma.$executeRawUnsafe(`
    ALTER TABLE ${table}
    DROP CONSTRAINT IF EXISTS ${constraintName}
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE ${table}
    DROP COLUMN IF EXISTS tenant_id
  `);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function up(prisma) {
  const defaultTenantSlug = process.env.DEFAULT_TENANT_SLUG || 'default';
  const defaultTenantName = process.env.DEFAULT_TENANT_NAME || 'Default Tenant';

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS tenants (
      id            TEXT PRIMARY KEY,
      slug          TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'active',
      domains       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      branding      JSONB,
      configuration JSONB,
      metadata      JSONB,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO tenants (id, slug, name, status, branding, configuration, metadata)
      VALUES ($1, $2, $3, 'active', '{}'::jsonb, '{}'::jsonb, jsonb_build_object('bootstrappedBy', '20260326000000_multitenancy'))
      ON CONFLICT (id) DO UPDATE
      SET slug = EXCLUDED.slug,
          name = EXCLUDED.name,
          status = 'active',
          updated_at = NOW()
    `,
    DEFAULT_TENANT_ID,
    defaultTenantSlug,
    defaultTenantName,
  );

  for (const table of TENANT_TABLES) {
    await addTenantColumn(prisma, table);
  }

  for (const statement of TENANT_INDEXES) {
    await prisma.$executeRawUnsafe(statement);
  }
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function down(prisma) {
  for (const statement of [...TENANT_INDEXES].reverse()) {
    const indexName = statement.match(/idx_[a-z_]+/i)?.[0];
    if (indexName) {
      await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS ${indexName}`);
    }
  }

  for (const table of [...TENANT_TABLES].reverse()) {
    await dropTenantColumn(prisma, table);
  }

  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS tenants`);
}
