/**
 * Database Seed Script
 *
 * Populates the PostgreSQL database with realistic test data
 * for local development. Does NOT write to the Stellar blockchain —
 * data is inserted directly into the DB as if it had been indexed.
 *
 * Usage:
 *   cd backend && node ../scripts/seed.js
 *
 * TODO (contributor — medium, Issue #44):
 * - Add more realistic escrow scenarios (disputes, cancelled, mixed statuses)
 * - Add configurable count via CLI arg: node seed.js --count 50
 * - Ensure seeded data is consistent with on-chain state (same IDs, amounts)
 */

import 'dotenv/config';
// TODO (contributor): uncomment when Prisma is installed
// const { PrismaClient } = require('@prisma/client');
// const prisma = new PrismaClient();

const SEED_DATA = {
  escrows: [
    {
      id: BigInt(1),
      clientAddress: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567890ABCDE12345FGHIJK',
      freelancerAddress: 'GXYZABCDEFGHIJKLMNOPQRSTUVWXYZ234567890ABCDE12345FG',
      tokenAddress: 'USDC_CONTRACT_ADDRESS',
      totalAmount: '2000000000', // 2000 USDC in base units (7 decimals)
      remainingBalance: '1500000000',
      status: 'Active',
      briefHash: 'QmSampleIPFSHash1234567890abcdef',
      createdAt: new Date('2025-03-01'),
      createdLedger: BigInt(100000),
    },
    {
      id: BigInt(2),
      clientAddress: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567890ABCDE12345FGHIJK',
      freelancerAddress: 'GLMNOPQRSTUVWXYZ234567890ABCDEFGHIJKLMNO12345PQRSTU',
      tokenAddress: 'USDC_CONTRACT_ADDRESS',
      totalAmount: '500000000', // 500 USDC
      remainingBalance: '0',
      status: 'Completed',
      briefHash: 'QmSampleIPFSHash0987654321fedcba',
      createdAt: new Date('2025-02-01'),
      createdLedger: BigInt(95000),
    },
    {
      id: BigInt(3),
      clientAddress: 'GVWXYZ234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ234567890AB',
      freelancerAddress: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567890ABCDE12345FGHIJK',
      tokenAddress: 'USDC_CONTRACT_ADDRESS',
      totalAmount: '5000000000', // 5000 USDC
      remainingBalance: '3000000000',
      status: 'Disputed',
      briefHash: 'QmDisputedEscrowIPFSHashABCDEF',
      createdAt: new Date('2025-02-15'),
      createdLedger: BigInt(97000),
    },
  ],

  milestones: [
    // Escrow 1 milestones
    {
      escrowId: BigInt(1),
      milestoneIndex: 0,
      title: 'Initial Design Mockups',
      amount: '500000000',
      status: 'Approved',
      descriptionHash: 'QmMilestone1a',
    },
    {
      escrowId: BigInt(1),
      milestoneIndex: 1,
      title: 'Frontend Development',
      amount: '1000000000',
      status: 'Submitted',
      descriptionHash: 'QmMilestone1b',
    },
    {
      escrowId: BigInt(1),
      milestoneIndex: 2,
      title: 'Final Delivery & Review',
      amount: '500000000',
      status: 'Pending',
      descriptionHash: 'QmMilestone1c',
    },
    // Escrow 2 milestones (all approved)
    {
      escrowId: BigInt(2),
      milestoneIndex: 0,
      title: 'Logo Concepts',
      amount: '150000000',
      status: 'Approved',
      descriptionHash: 'QmMilestone2a',
    },
    {
      escrowId: BigInt(2),
      milestoneIndex: 1,
      title: 'Revisions Round 1',
      amount: '200000000',
      status: 'Approved',
      descriptionHash: 'QmMilestone2b',
    },
    {
      escrowId: BigInt(2),
      milestoneIndex: 2,
      title: 'Final Files',
      amount: '150000000',
      status: 'Approved',
      descriptionHash: 'QmMilestone2c',
    },
  ],

  reputationRecords: [
    {
      address: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567890ABCDE12345FGHIJK',
      totalScore: BigInt(120),
      completedEscrows: 8,
      disputedEscrows: 1,
      disputesWon: 0,
      totalVolume: '15000000000',
      lastUpdated: new Date('2025-03-10'),
    },
    {
      address: 'GXYZABCDEFGHIJKLMNOPQRSTUVWXYZ234567890ABCDE12345FG',
      totalScore: BigInt(85),
      completedEscrows: 5,
      disputedEscrows: 0,
      disputesWon: 0,
      totalVolume: '8000000000',
      lastUpdated: new Date('2025-03-08'),
    },
  ],
};

async function seed() {
  console.log('🌱 Seeding database…');
  console.log('');

  // TODO (contributor — Issue #44): uncomment and implement with Prisma
  /*
  await prisma.$transaction(async (tx) => {
    // Clear existing data
    await tx.dispute.deleteMany();
    await tx.milestone.deleteMany();
    await tx.escrow.deleteMany();
    await tx.reputationRecord.deleteMany();
    console.log("   🗑️  Cleared existing data");

    // Insert escrows
    for (const escrow of SEED_DATA.escrows) {
      await tx.escrow.create({ data: escrow });
    }
    console.log(`   ✅ Inserted ${SEED_DATA.escrows.length} escrows`);

    // Insert milestones
    for (const m of SEED_DATA.milestones) {
      await tx.milestone.create({ data: m });
    }
    console.log(`   ✅ Inserted ${SEED_DATA.milestones.length} milestones`);

    // Insert reputation records
    for (const rep of SEED_DATA.reputationRecords) {
      await tx.reputationRecord.create({ data: rep });
    }
    console.log(`   ✅ Inserted ${SEED_DATA.reputationRecords.length} reputation records`);
  });
  */

  console.log('⚠️  Seed logic is stubbed — see Issue #44 to implement');
  console.log('');
  console.log('Seed data preview:');
  console.log(`  Escrows:    ${SEED_DATA.escrows.length}`);
  console.log(`  Milestones: ${SEED_DATA.milestones.length}`);
  console.log(`  Reputation: ${SEED_DATA.reputationRecords.length}`);
  console.log('');
  console.log('✅ Done');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
