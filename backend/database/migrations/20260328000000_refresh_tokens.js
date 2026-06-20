/**
 * Migration: Add refresh tokens table for token rotation
 *
 * This migration creates a dedicated refresh_tokens table to support:
 * - Multiple concurrent refresh tokens per user
 * - Token rotation tracking
 * - Device/session identification
 * - Secure token management
 */

export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      tenant_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      device_info JSONB,
      ip_address TEXT,
      user_agent TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      expires_at TIMESTAMPTZ NOT NULL,
      last_used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_tenant ON refresh_tokens(user_id, tenant_id)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_is_active ON refresh_tokens(is_active)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ language 'plpgsql'
  `);

  await prisma.$executeRawUnsafe(`
    DROP TRIGGER IF EXISTS update_refresh_tokens_updated_at ON refresh_tokens
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER update_refresh_tokens_updated_at
      BEFORE UPDATE ON refresh_tokens
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column()
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE users DROP COLUMN IF EXISTS refresh_token
  `);
}

export async function down(prisma) {
  await prisma.$executeRawUnsafe(`
    DROP TRIGGER IF EXISTS update_refresh_tokens_updated_at ON refresh_tokens
  `);

  await prisma.$executeRawUnsafe(`
    DROP TABLE IF EXISTS refresh_tokens
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS refresh_token TEXT
  `);
}
