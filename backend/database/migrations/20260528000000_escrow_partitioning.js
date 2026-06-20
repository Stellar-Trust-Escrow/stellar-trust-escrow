/**
 * Migration: Add monthly escrow archive partitions
 * Version:   20260528000000_escrow_partitioning
 */

function monthlyArchiveTableName(date = new Date()) {
  const value = new Date(date);
  return `escrows_archive_${value.getUTCFullYear()}_${String(value.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS escrow_partition_manifest (
      partition_name TEXT PRIMARY KEY,
      month_start     TIMESTAMPTZ NOT NULL,
      month_end       TIMESTAMPTZ NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const current = monthlyArchiveTableName();
  const next = monthlyArchiveTableName(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ${current} (LIKE escrows INCLUDING ALL)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ${next} (LIKE escrows INCLUDING ALL)
  `);

  await prisma.$executeRawUnsafe(
    `
    INSERT INTO escrow_partition_manifest (partition_name, month_start, month_end)
    VALUES ($1, date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'), date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 month')
    ON CONFLICT (partition_name) DO NOTHING
  `,
    current,
  );
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function down(prisma) {
  const current = monthlyArchiveTableName();
  const next = monthlyArchiveTableName(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${current}`);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${next}`);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS escrow_partition_manifest`);
}
