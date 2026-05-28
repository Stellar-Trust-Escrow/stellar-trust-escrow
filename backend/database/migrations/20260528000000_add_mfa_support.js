/**
 * Migration: Add MFA Support
 *
 * Adds multi-factor authentication tables and fields:
 * - User role and MFA flags
 * - MFA methods (TOTP and WebAuthn)
 * - MFA attempts tracking
 * - MFA lockouts for brute-force protection
 *
 * @module migrations/20260528000000_add_mfa_support
 */

export const up = async (prisma) => {
  console.log('Running migration: Add MFA Support');

  // Add MFA fields to users table
  await prisma.$executeRaw`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user',
    ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS mfa_enforced BOOLEAN DEFAULT false;
  `;

  // Create indexes on new user fields
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON users(wallet_address);
  `;
  
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  `;

  // Create MFA methods table
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS mfa_methods (
      id VARCHAR(30) PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tenant_id VARCHAR(30) NOT NULL,
      type VARCHAR(20) NOT NULL CHECK (type IN ('TOTP', 'WEBAUTHN')),
      name VARCHAR(255) NOT NULL,
      is_active BOOLEAN DEFAULT true,
      is_primary BOOLEAN DEFAULT false,
      
      -- TOTP fields
      totp_secret TEXT,
      totp_backup_codes TEXT[] DEFAULT '{}',
      
      -- WebAuthn fields
      credential_id TEXT UNIQUE,
      public_key TEXT,
      counter BIGINT DEFAULT 0,
      transports TEXT[] DEFAULT '{}',
      aaguid VARCHAR(255),
      
      last_used_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // Create indexes for MFA methods
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS idx_mfa_methods_user_tenant ON mfa_methods(user_id, tenant_id);
  `;
  
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS idx_mfa_methods_user_active ON mfa_methods(user_id, is_active);
  `;
  
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS idx_mfa_methods_type_active ON mfa_methods(type, is_active);
  `;
  
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS idx_mfa_methods_credential ON mfa_methods(credential_id);
  `;

  // Create MFA attempts table for tracking and brute-force protection
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS mfa_attempts (
      id VARCHAR(30) PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tenant_id VARCHAR(30) NOT NULL,
      method_type VARCHAR(20) NOT NULL CHECK (method_type IN ('TOTP', 'WEBAUTHN')),
      success BOOLEAN NOT NULL,
      ip_address VARCHAR(45) NOT NULL,
      user_agent TEXT,
      failure_reason TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // Create indexes for MFA attempts
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS idx_mfa_attempts_user_created ON mfa_attempts(user_id, created_at DESC);
  `;
  
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS idx_mfa_attempts_user_success ON mfa_attempts(user_id, success, created_at DESC);
  `;
  
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS idx_mfa_attempts_ip ON mfa_attempts(ip_address, created_at DESC);
  `;
  
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS idx_mfa_attempts_created ON mfa_attempts(created_at);
  `;

  // Create MFA lockouts table
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS mfa_lockouts (
      id VARCHAR(30) PRIMARY KEY,
      user_id INTEGER UNIQUE NOT NULL,
      tenant_id VARCHAR(30) NOT NULL,
      locked_until TIMESTAMP NOT NULL,
      reason TEXT DEFAULT 'Too many failed MFA attempts',
      attempts INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // Create indexes for MFA lockouts
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS idx_mfa_lockouts_user_until ON mfa_lockouts(user_id, locked_until);
  `;
  
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS idx_mfa_lockouts_until ON mfa_lockouts(locked_until);
  `;

  console.log('Migration completed: Add MFA Support');
};

export const down = async (prisma) => {
  console.log('Rolling back migration: Add MFA Support');

  // Drop tables in reverse order
  await prisma.$executeRaw`DROP TABLE IF EXISTS mfa_lockouts;`;
  await prisma.$executeRaw`DROP TABLE IF EXISTS mfa_attempts;`;
  await prisma.$executeRaw`DROP TABLE IF EXISTS mfa_methods;`;

  // Remove columns from users table
  await prisma.$executeRaw`
    ALTER TABLE users
    DROP COLUMN IF EXISTS role,
    DROP COLUMN IF EXISTS mfa_enabled,
    DROP COLUMN IF EXISTS mfa_enforced;
  `;

  console.log('Rollback completed: Add MFA Support');
};
