/* global console, process */
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.join(__dirname, 'generated.json');

const DEFAULT_USER_COUNT = 180;
const DEFAULT_ESCROW_COUNT = 1200;
const DEFAULT_MILESTONES_PER_ESCROW = 3;
const STATUSES = ['Active', 'Completed', 'Disputed', 'Cancelled'];
const MILESTONE_STATUSES = ['Pending', 'Submitted', 'Approved', 'Rejected'];

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function padBase32(source, length) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let value = BigInt(source);
  let output = '';

  while (output.length < length) {
    output = alphabet[Number(value % 32n)] + output;
    value /= 32n;
  }

  return output;
}

function makeAddress(index) {
  return `G${padBase32(BigInt(index) + 1n, 55)}`;
}

function makeEscrow({
  id,
  clientAddress,
  freelancerAddress,
  status,
  amount,
  createdAt,
  milestoneCount,
}) {
  const milestones = [];
  let approvedAmount = 0n;

  for (let milestoneIndex = 0; milestoneIndex < milestoneCount; milestoneIndex += 1) {
    const milestoneAmount =
      amount / BigInt(milestoneCount) +
      BigInt(milestoneIndex === 0 ? amount % BigInt(milestoneCount) : 0);
    const milestoneStatus = MILESTONE_STATUSES[(id + milestoneIndex) % MILESTONE_STATUSES.length];
    if (milestoneStatus === 'Approved') {
      approvedAmount += milestoneAmount;
    }

    milestones.push({
      id: id * 100 + milestoneIndex + 1,
      escrowId: id,
      milestoneIndex,
      title: `Milestone ${milestoneIndex + 1}`,
      amount: milestoneAmount.toString(),
      status: milestoneStatus,
      submittedAt: new Date(createdAt.getTime() + milestoneIndex * 3_600_000).toISOString(),
      resolvedAt:
        milestoneStatus === 'Pending'
          ? null
          : new Date(createdAt.getTime() + (milestoneIndex + 2) * 3_600_000).toISOString(),
    });
  }

  return {
    id,
    clientAddress,
    freelancerAddress,
    status,
    totalAmount: amount.toString(),
    remainingBalance: (amount - approvedAmount).toString(),
    deadline: new Date(createdAt.getTime() + 14 * 24 * 3_600_000).toISOString(),
    createdAt: createdAt.toISOString(),
    milestones,
  };
}

export async function generateLoadTestData() {
  const userCount = parsePositiveInteger(process.env.LOAD_TEST_USER_COUNT, DEFAULT_USER_COUNT);
  const escrowCount = parsePositiveInteger(
    process.env.LOAD_TEST_ESCROW_COUNT,
    DEFAULT_ESCROW_COUNT,
  );
  const milestoneCount = parsePositiveInteger(
    process.env.LOAD_TEST_MILESTONES_PER_ESCROW,
    DEFAULT_MILESTONES_PER_ESCROW,
  );

  const users = Array.from({ length: userCount }, (_, index) => {
    const address = makeAddress(index + 1);
    return {
      address,
      totalScore: (1000 - index * 3).toString(),
      completedEscrows: 5 + (index % 18),
      disputedEscrows: index % 4,
      disputesWon: index % 3,
      totalVolume: (25_000 + index * 750).toString(),
      recentEscrowIds: [],
    };
  });

  const escrows = [];
  const milestones = [];

  for (let index = 0; index < escrowCount; index += 1) {
    const id = index + 1;
    const client = users[index % users.length];
    const freelancer = users[(index * 7 + 11) % users.length];
    const amount = BigInt(2_000 + index * 17);
    const status = STATUSES[index % STATUSES.length];
    const createdAt = new Date(Date.now() - index * 15 * 60_000);
    const escrow = makeEscrow({
      id,
      clientAddress: client.address,
      freelancerAddress: freelancer.address,
      status,
      amount,
      createdAt,
      milestoneCount,
    });

    escrows.push({
      id: escrow.id,
      clientAddress: escrow.clientAddress,
      freelancerAddress: escrow.freelancerAddress,
      status: escrow.status,
      totalAmount: escrow.totalAmount,
      remainingBalance: escrow.remainingBalance,
      deadline: escrow.deadline,
      createdAt: escrow.createdAt,
    });
    milestones.push(...escrow.milestones);
    client.recentEscrowIds.unshift(id);
    freelancer.recentEscrowIds.unshift(id);
    client.recentEscrowIds = client.recentEscrowIds.slice(0, 8);
    freelancer.recentEscrowIds = freelancer.recentEscrowIds.slice(0, 8);
  }

  const result = {
    generatedAt: new Date().toISOString(),
    users: users.map((user) => ({
      ...user,
      recentEscrows: user.recentEscrowIds
        .map((escrowId) => escrows.find((escrow) => escrow.id === escrowId))
        .filter(Boolean),
    })),
    escrows,
    milestones,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(result, null, 2));

  console.log(
    `Generated load-test data: ${result.users.length} users, ${result.escrows.length} escrows, ${result.milestones.length} milestones`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateLoadTestData().catch((error) => {
    console.error('[load-tests:data] Failed to generate data:', error);
    process.exitCode = 1;
  });
}
