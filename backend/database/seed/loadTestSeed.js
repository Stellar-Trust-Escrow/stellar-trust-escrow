/**
 * Load Test Seed Script
 * 
 * Generates 10 users, 50 escrows, and 200 milestones for the k6 load testing suite.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Seeding database for load tests…\n');

  console.log('🗑  Resetting data…');
  await prisma.$transaction([
    prisma.dispute.deleteMany(),
    prisma.milestone.deleteMany(),
    prisma.escrow.deleteMany(),
    prisma.reputationRecord.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  // Generate 10 Users
  const users = [];
  for (let i = 1; i <= 10; i++) {
    users.push({
      email: i === 1 ? 'client@example.com' : `user${i}@example.com`,
      // password123
      password: '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31l',
    });
  }

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: u,
    });
  }
  console.log(`✅ Users:      ${users.length}`);

  // Generate 50 Escrows
  const escrows = [];
  for (let i = 1; i <= 50; i++) {
    escrows.push({
      id: BigInt(i),
      clientAddress: `GCLIENT${i.toString().padStart(47, '0')}`,
      freelancerAddress: `GFREELANCER${i.toString().padStart(43, '0')}`,
      tokenAddress: 'USDC_SAC_CONTRACT_ADDRESS_TESTNET',
      totalAmount: '1000000000',
      remainingBalance: '1000000000',
      status: 'Active',
      briefHash: `QmSeedBriefHash${i.toString().padStart(31, '1')}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdLedger: BigInt(100000 + i),
    });
  }

  for (const e of escrows) {
    await prisma.escrow.upsert({
      where: { id: e.id },
      update: {},
      create: e,
    });
  }
  console.log(`✅ Escrows:    ${escrows.length}`);

  // Generate 200 Milestones (4 per escrow)
  const milestones = [];
  let msCount = 0;
  for (let i = 1; i <= 50; i++) {
    for (let j = 0; j < 4; j++) {
      milestones.push({
        escrowId: BigInt(i),
        milestoneIndex: j,
        title: `Milestone ${j + 1} for Escrow ${i}`,
        amount: '250000000',
        status: 'Pending',
        descriptionHash: `QmM${i}x${j}`,
      });
      msCount++;
    }
  }

  for (const m of milestones) {
    await prisma.milestone.upsert({
      where: {
        escrowId_milestoneIndex: { escrowId: m.escrowId, milestoneIndex: m.milestoneIndex },
      },
      update: {},
      create: m,
    });
  }
  console.log(`✅ Milestones: ${milestones.length}`);

  console.log('\n✅ Load test seed complete.');
}

seed()
  .catch((err) => {
    console.error('❌ Load test seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
