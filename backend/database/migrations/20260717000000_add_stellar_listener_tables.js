/**
 * Migration: Add Stellar Horizon event listener tables
 *
 * Creates tables for:
 *  - processed_events: deduplication using paging_token
 *  - system_config: persistent cursor storage for Horizon stream
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function up(prisma) {
  // Create processed_events table for deduplication
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS processed_events (
      id SERIAL PRIMARY KEY,
      paging_token VARCHAR(255) UNIQUE NOT NULL,
      ledger_sequence BIGINT NOT NULL,
      transaction_hash VARCHAR(255) NOT NULL,
      event_index INTEGER NOT NULL,
      event_type VARCHAR(100) NOT NULL,
      escrow_id BIGINT,
      event_data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes for processed_events
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_processed_events_paging_token 
    ON processed_events(paging_token)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_processed_events_ledger 
    ON processed_events(ledger_sequence)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_processed_events_type 
    ON processed_events(event_type)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_processed_events_escrow_id 
    ON processed_events(escrow_id)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_processed_events_created_at 
    ON processed_events(created_at DESC)
  `);

  // Create system_config table for cursor and listener state
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS system_config (
      key VARCHAR(255) PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create index for system_config
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_system_config_key 
    ON system_config(key)
  `);

  // Insert default row for Horizon cursor if not exists
  await prisma.$executeRawUnsafe(`
    INSERT INTO system_config (key, value, description, updated_at)
    VALUES ('horizon_cursor', 'now', 'Cursor for Stellar Horizon event stream; "now" means start from latest', NOW())
    ON CONFLICT (key) DO NOTHING
  `);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function down(prisma) {
  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS processed_events CASCADE');
  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS system_config CASCADE');
}
