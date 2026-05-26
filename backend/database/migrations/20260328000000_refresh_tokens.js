/**
 * Migration: Add refresh tokens table for token rotation
 * 
 * This migration creates a dedicated refresh_tokens table to support:
 * - Multiple concurrent refresh tokens per user
 * - Token rotation tracking
 * - Device/session identification
 * - Secure token management
 */

export async function up(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id INTEGER NOT NULL,
      tenant_id VARCHAR(255) NOT NULL,
      token_hash VARCHAR(255) NOT NULL UNIQUE,
      device_info JSONB,
      ip_address INET,
      user_agent TEXT,
      is_active BOOLEAN DEFAULT true,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      last_used_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      
      FOREIGN KEY (user_id, tenant_id) REFERENCES users(id, tenant_id) ON DELETE CASCADE
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_tenant ON refresh_tokens(user_id, tenant_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_is_active ON refresh_tokens(is_active);
  `);

  await db.query(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  await db.query(`
    CREATE TRIGGER update_refresh_tokens_updated_at 
        BEFORE UPDATE ON refresh_tokens 
        FOR EACH ROW 
        EXECUTE FUNCTION update_updated_at_column();
  `);

  // Remove the old refreshToken column from users table
  await db.query(`
    ALTER TABLE users DROP COLUMN IF EXISTS refresh_token;
  `);
}

export async function down(db) {
  await db.query(`
    DROP TRIGGER IF EXISTS update_refresh_tokens_updated_at ON refresh_tokens;
  `);

  await db.query(`
    DROP FUNCTION IF EXISTS update_updated_at_column();
  `);

  await db.query(`
    DROP TABLE IF EXISTS refresh_tokens;
  `);

  // Add back the old refreshToken column for rollback
  await db.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS refresh_token VARCHAR(255);
  `);
}
