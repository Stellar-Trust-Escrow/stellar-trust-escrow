/**
 * Database Seed Script
 *
 * Populates the PostgreSQL database with realistic test data
 * for local development. Does NOT write to the Stellar blockchain —
 * data is inserted directly into the DB as if it had been indexed.
 *
 * Usage:
 *   cd backend && node ../scripts/seed.js [--count 50] [--dry-run]
 *
 * Options:
 *   --count <n>   Number of generated escrows to add (default: 0, uses fixtures)
 *   --dry-run     Print what would be seeded without writing to DB
 *   --force       Skip the idempotency guard and re-seed even if data exists
 */

import 'dotenv/config';

// ── CLI argument parsing ──────────────────────────────────────────────────────

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const forceReseed = args.includes('--force');
const countIdx = args.indexOf('--count');
const extraCount = countIdx !== -1 ? Math.max(0, parseInt(args[countIdx + 1] ?? '0', 10)) : 0;

if (isDryRun) console.log('🔍  Dry-run mode — no writes will occur\n');

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
  console.log('🌱 Seeding database…\n');

  // ── Idempotency guard ─────────────────────────────────────────────────────
  // Running seed twice in CI can produce duplicate-key errors or corrupt test
  // baseline data. The guard checks for existing rows before writing and
  // aborts unless --force is passed, making the script safe to run in pipelines.

  // TODO (contributor — Issue #44): uncomment when Prisma is installed
  /*
  if (!forceReseed) {
    const existingCount = await prisma.escrow.count();
    if (existingCount > 0) {
      console.log(`ℹ️  Database already contains ${existingCount} escrow(s).`);
      console.log('   Pass --force to re-seed. Exiting without changes.\n');
      return;
    }
  }

  if (isDryRun) {
    console.log('Seed data preview (dry-run):');
    console.log(`  Escrows (fixtures):    ${SEED_DATA.escrows.length}`);
    console.log(`  Milestones (fixtures): ${SEED_DATA.milestones.length}`);
    console.log(`  Reputation (fixtures): ${SEED_DATA.reputationRecords.length}`);
    console.log(`  Extra escrows (--count): ${extraCount}`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (forceReseed) {
      await tx.dispute.deleteMany();
      await tx.milestone.deleteMany();
      await tx.escrow.deleteMany();
      await tx.reputationRecord.deleteMany();
      console.log('   🗑️  Cleared existing data (--force)');
    }

    // Upsert so repeated runs are idempotent even with --force skipped
    for (const escrow of SEED_DATA.escrows) {
      await tx.escrow.upsert({
        where: { id: escrow.id },
        update: {},
        create: escrow,
      });
    }
    console.log(`   ✅ Upserted ${SEED_DATA.escrows.length} fixture escrows`);

    for (const m of SEED_DATA.milestones) {
      await tx.milestone.upsert({
        where: { escrowId_milestoneIndex: { escrowId: m.escrowId, milestoneIndex: m.milestoneIndex } },
        update: {},
        create: m,
      });
    }
    console.log(`   ✅ Upserted ${SEED_DATA.milestones.length} milestones`);

    for (const rep of SEED_DATA.reputationRecords) {
      await tx.reputationRecord.upsert({
        where: { address: rep.address },
        update: {},
        create: rep,
      });
    }
    console.log(`   ✅ Upserted ${SEED_DATA.reputationRecords.length} reputation records`);
  });
  */

  console.log('⚠️  Seed logic is stubbed — see Issue #44 to implement');
  console.log('\nSeed data preview:');
  console.log(`  Escrows (fixtures):      ${SEED_DATA.escrows.length}`);
  console.log(`  Milestones (fixtures):   ${SEED_DATA.milestones.length}`);
  console.log(`  Reputation (fixtures):   ${SEED_DATA.reputationRecords.length}`);
  console.log(`  Extra escrows (--count): ${extraCount}`);
  console.log(`  Dry-run:                 ${isDryRun}`);
  console.log(`  Force re-seed:           ${forceReseed}`);
  console.log('');
  console.log('✅ Done');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
