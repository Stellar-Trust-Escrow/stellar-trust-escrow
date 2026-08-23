import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function listArchiveTables() {
  const result = await prisma.$queryRaw`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE 'escrow_archive_%'
    ORDER BY table_name
  `;
  return result.map((r) => r.table_name);
}

export async function archiveEscrow(escrowId) {
  const escrow = await prisma.escrow.findUnique({ where: { id: escrowId } });
  if (!escrow) throw new Error(`Escrow ${escrowId} not found`);

  await prisma.escrowArchive.create({ data: { ...escrow, archivedAt: new Date() } });
  await prisma.escrow.delete({ where: { id: escrowId } });

  return { archived: escrowId };
}

export async function restoreEscrow(escrowId) {
  const archive = await prisma.escrowArchive.findUnique({ where: { escrowId } });
  if (!archive) throw new Error(`Archive for ${escrowId} not found`);

  const { archivedAt, ...data } = archive;
  await prisma.escrow.create({ data });
  await prisma.escrowArchive.delete({ where: { escrowId } });

  return { restored: escrowId };
}

export default { listArchiveTables, archiveEscrow, restoreEscrow };
