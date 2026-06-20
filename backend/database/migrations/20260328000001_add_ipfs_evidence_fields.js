/**
 * Migration: Add IPFS evidence fields
 *
 * This migration adds fields to the dispute_evidence table to support
 * IPFS file storage, virus scanning, and thumbnail generation.
 */

export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE dispute_evidence
      ALTER COLUMN evidence_type TYPE TEXT,
      ADD COLUMN IF NOT EXISTS filename TEXT,
      ADD COLUMN IF NOT EXISTS mime_type TEXT,
      ADD COLUMN IF NOT EXISTS file_size INTEGER,
      ADD COLUMN IF NOT EXISTS ipfs_cid TEXT,
      ADD COLUMN IF NOT EXISTS thumbnail_cid TEXT,
      ADD COLUMN IF NOT EXISTS scan_status TEXT DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS scan_result TEXT
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS dispute_evidence_ipfs_cid_idx ON dispute_evidence(ipfs_cid)
  `);
}

export async function down(prisma) {
  await prisma.$executeRawUnsafe(`
    DROP INDEX IF EXISTS dispute_evidence_ipfs_cid_idx
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE dispute_evidence
      DROP COLUMN IF EXISTS filename,
      DROP COLUMN IF EXISTS mime_type,
      DROP COLUMN IF EXISTS file_size,
      DROP COLUMN IF EXISTS ipfs_cid,
      DROP COLUMN IF EXISTS thumbnail_cid,
      DROP COLUMN IF EXISTS scan_status,
      DROP COLUMN IF EXISTS scan_result
  `);
}
