/**
 * Seed data for local development and testing.
 * All amounts are in base token units (7 decimal places — e.g. 1 USDC = 10_000_000).
 */

export const USERS = [
  {
    email: 'client@example.com',
    // bcrypt hash of "password123" — never use real passwords in seeds
    password: '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW',
  },
  {
    email: 'freelancer@example.com',
    password: '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW',
  },
];

export const CLIENT_ADDR = 'GABCDE1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ234567890ABC';
export const FREELANCER_ADDR = 'GXYZ1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ234567890ABCDE';
export const TOKEN_ADDR = 'USDC_SAC_CONTRACT_ADDRESS_TESTNET';

export const ESCROWS = [
  {
    id: BigInt(1),
    clientAddress: CLIENT_ADDR,
    freelancerAddress: FREELANCER_ADDR,
    tokenAddress: TOKEN_ADDR,
    totalAmount: '2000_0000000'.replace('_', ''),
    remainingBalance: '1500_0000000'.replace('_', ''),
    status: 'Active',
    briefHash: 'QmSeedBriefHash1111111111111111111111111111111',
    createdAt: new Date('2026-01-10T10:00:00Z'),
    updatedAt: new Date('2026-01-10T10:00:00Z'),
    createdLedger: BigInt(100000),
  },
  {
    id: BigInt(2),
    clientAddress: CLIENT_ADDR,
    freelancerAddress: FREELANCER_ADDR,
    tokenAddress: TOKEN_ADDR,
    totalAmount: '500_0000000'.replace('_', ''),
    remainingBalance: '0',
    status: 'Completed',
    briefHash: 'QmSeedBriefHash2222222222222222222222222222222',
    createdAt: new Date('2026-01-01T08:00:00Z'),
    updatedAt: new Date('2026-01-20T12:00:00Z'),
    createdLedger: BigInt(95000),
  },
  {
    id: BigInt(3),
    clientAddress: CLIENT_ADDR,
    freelancerAddress: FREELANCER_ADDR,
    tokenAddress: TOKEN_ADDR,
    totalAmount: '5000_0000000'.replace('_', ''),
    remainingBalance: '3000_0000000'.replace('_', ''),
    status: 'Disputed',
    briefHash: 'QmSeedBriefHash3333333333333333333333333333333',
    createdAt: new Date('2026-01-15T09:00:00Z'),
    updatedAt: new Date('2026-02-01T14:00:00Z'),
    createdLedger: BigInt(97000),
  },
];

export const MILESTONES = [
  // Escrow 1
  {
    escrowId: BigInt(1),
    milestoneIndex: 0,
    title: 'Design Mockups',
    amount: '500_0000000'.replace('_', ''),
    status: 'Approved',
    descriptionHash: 'QmM1a',
    submittedAt: new Date('2026-01-12'),
    resolvedAt: new Date('2026-01-13'),
  },
  {
    escrowId: BigInt(1),
    milestoneIndex: 1,
    title: 'Frontend Dev',
    amount: '1000_0000000'.replace('_', ''),
    status: 'Submitted',
    descriptionHash: 'QmM1b',
    submittedAt: new Date('2026-01-20'),
    resolvedAt: null,
  },
  {
    escrowId: BigInt(1),
    milestoneIndex: 2,
    title: 'Final Delivery',
    amount: '500_0000000'.replace('_', ''),
    status: 'Pending',
    descriptionHash: 'QmM1c',
    submittedAt: null,
    resolvedAt: null,
  },
  // Escrow 2 (all approved)
  {
    escrowId: BigInt(2),
    milestoneIndex: 0,
    title: 'Logo Concepts',
    amount: '150_0000000'.replace('_', ''),
    status: 'Approved',
    descriptionHash: 'QmM2a',
    submittedAt: new Date('2026-01-05'),
    resolvedAt: new Date('2026-01-06'),
  },
  {
    escrowId: BigInt(2),
    milestoneIndex: 1,
    title: 'Revisions',
    amount: '200_0000000'.replace('_', ''),
    status: 'Approved',
    descriptionHash: 'QmM2b',
    submittedAt: new Date('2026-01-10'),
    resolvedAt: new Date('2026-01-11'),
  },
  {
    escrowId: BigInt(2),
    milestoneIndex: 2,
    title: 'Final Files',
    amount: '150_0000000'.replace('_', ''),
    status: 'Approved',
    descriptionHash: 'QmM2c',
    submittedAt: new Date('2026-01-18'),
    resolvedAt: new Date('2026-01-19'),
  },
  // Escrow 3 (disputed)
  {
    escrowId: BigInt(3),
    milestoneIndex: 0,
    title: 'Architecture Design',
    amount: '2000_0000000'.replace('_', ''),
    status: 'Approved',
    descriptionHash: 'QmM3a',
    submittedAt: new Date('2026-01-20'),
    resolvedAt: new Date('2026-01-21'),
  },
  {
    escrowId: BigInt(3),
    milestoneIndex: 1,
    title: 'Backend API',
    amount: '3000_0000000'.replace('_', ''),
    status: 'Rejected',
    descriptionHash: 'QmM3b',
    submittedAt: new Date('2026-01-28'),
    resolvedAt: new Date('2026-02-01'),
  },
];

export const REPUTATION = [
  {
    address: CLIENT_ADDR,
    totalScore: BigInt(120),
    completedEscrows: 8,
    disputedEscrows: 1,
    disputesWon: 0,
    totalVolume: '15000_0000000'.replace('_', ''),
    lastUpdated: new Date('2026-02-10'),
  },
  {
    address: FREELANCER_ADDR,
    totalScore: BigInt(85),
    completedEscrows: 5,
    disputedEscrows: 0,
    disputesWon: 0,
    totalVolume: '8000_0000000'.replace('_', ''),
    lastUpdated: new Date('2026-02-08'),
  },
];
