/**
 * Database Seed Script
 *
 * Populates the database with realistic development/test data.
 * Safe to run multiple times — uses upsert throughout.
 *
 * Usage:
 *   cd backend && node database/seed/index.js
 *   cd backend && node database/seed/index.js --reset   # clears data first
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { USERS, ESCROWS, MILESTONES, REPUTATION } from './data.js';

const prisma = new PrismaClient();
const reset = process.argv.includes('--reset');

async function seed() {
  console.log('🌱 Seeding database…\n');

  if (reset) {
    console.log('🗑  Resetting data…');
    await prisma.$transaction([
      prisma.dispute.deleteMany(),
      prisma.milestone.deleteMany(),
      prisma.escrow.deleteMany(),
      prisma.reputationRecord.deleteMany(),
      prisma.user.deleteMany(),
    ]);
    console.log('   Done.\n');
  }

  // Users
  for (const u of USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: u,
    });
  }
  console.log(`✅ Users:      ${USERS.length}`);

  // Escrows
  for (const e of ESCROWS) {
    await prisma.escrow.upsert({
      where: { id: e.id },
      update: { status: e.status, remainingBalance: e.remainingBalance, updatedAt: e.updatedAt },
      create: e,
    });
  }
  console.log(`✅ Escrows:    ${ESCROWS.length}`);

  // Milestones
  for (const m of MILESTONES) {
    await prisma.milestone.upsert({
      where: {
        escrowId_milestoneIndex: { escrowId: m.escrowId, milestoneIndex: m.milestoneIndex },
      },
      update: { status: m.status, submittedAt: m.submittedAt, resolvedAt: m.resolvedAt },
      create: m,
    });
  }
  console.log(`✅ Milestones: ${MILESTONES.length}`);

  // Reputation
  for (const r of REPUTATION) {
    await prisma.reputationRecord.upsert({
      where: { address: r.address },
      update: r,
      create: r,
    });
  }
  console.log(`✅ Reputation: ${REPUTATION.length}`);

  console.log('\n✅ Seed complete.');
}

seed()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
