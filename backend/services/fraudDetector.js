/**
 * Fraud Detection Service
 *
 * Scores completed escrows for collusion/wash-trading signals.
 * Flags escrows above FRAUD_SCORE_THRESHOLD and suspends reputation updates.
 *
 * Signals and default weights:
 *   SAME_IP           40  — client and freelancer share last-known IP
 *   RAPID_COMPLETION  20  — completed in < 1 hour
 *   REPEATED_PAIR     25  — same pair completed > 3 escrows together
 *   ROUND_AMOUNT      10  — amount divisible by 1M stroops
 *   ZERO_MILESTONES    5  — no milestones defined
 */

import prisma from '../lib/prisma.js';

const THRESHOLD       = parseInt(process.env.FRAUD_SCORE_THRESHOLD || '50', 10);
const RAPID_MS        = parseInt(process.env.FRAUD_RAPID_MS        || String(60 * 60 * 1000), 10);
const REPEATED_COUNT  = parseInt(process.env.FRAUD_REPEATED_PAIR   || '3', 10);

const W = {
  sameIp:          parseInt(process.env.FRAUD_W_SAME_IP  || '40', 10),
  rapidCompletion: parseInt(process.env.FRAUD_W_RAPID    || '20', 10),
  repeatedPair:    parseInt(process.env.FRAUD_W_PAIR     || '25', 10),
  roundAmount:     parseInt(process.env.FRAUD_W_ROUND    || '10', 10),
  zeroMilestones:  parseInt(process.env.FRAUD_W_ZERO_MS  || '5',  10),
};

async function checkSameIp(clientAddress, freelancerAddress) {
  try {
    const [c, f] = await Promise.all([
      prisma.session.findFirst({ where: { address: clientAddress,     revokedAt: null }, orderBy: { createdAt: 'desc' }, select: { ipAddress: true } }),
      prisma.session.findFirst({ where: { address: freelancerAddress, revokedAt: null }, orderBy: { createdAt: 'desc' }, select: { ipAddress: true } }),
    ]);
    return !!(c?.ipAddress && f?.ipAddress && c.ipAddress === f.ipAddress);
  } catch { return false; }
}

function checkRapidCompletion(createdAt, updatedAt) {
  if (!createdAt || !updatedAt) return false;
  return new Date(updatedAt) - new Date(createdAt) < RAPID_MS;
}

async function checkRepeatedPair(clientAddress, freelancerAddress, currentId) {
  try {
    const count = await prisma.escrow.count({
      where: { clientAddress, freelancerAddress, status: 'Completed', id: { not: BigInt(currentId) } },
    });
    return count >= REPEATED_COUNT;
  } catch { return false; }
}

function checkRoundAmount(totalAmount) {
  try { const n = BigInt(totalAmount); return n > 0n && n % 1_000_000n === 0n; }
  catch { return false; }
}

export async function scoreEscrow(escrow) {
  const signals = [];
  let score = 0;

  const [sameIp, repeatedPair] = await Promise.all([
    checkSameIp(escrow.clientAddress, escrow.freelancerAddress),
    checkRepeatedPair(escrow.clientAddress, escrow.freelancerAddress, escrow.id),
  ]);

  if (sameIp)                                              { score += W.sameIp;          signals.push('SAME_IP'); }
  if (checkRapidCompletion(escrow.createdAt, escrow.updatedAt)) { score += W.rapidCompletion; signals.push('RAPID_COMPLETION'); }
  if (repeatedPair)                                        { score += W.repeatedPair;    signals.push('REPEATED_PAIR'); }
  if (checkRoundAmount(escrow.totalAmount))                { score += W.roundAmount;     signals.push('ROUND_AMOUNT'); }

  const milestoneCount = await prisma.milestone.count({ where: { escrowId: escrow.id } }).catch(() => 0);
  if (milestoneCount === 0) { score += W.zeroMilestones; signals.push('ZERO_MILESTONES'); }

  return { score, signals, flagged: score >= THRESHOLD };
}

export async function runFraudCheck(escrowId) {
  const escrow = await prisma.escrow.findUnique({ where: { id: BigInt(escrowId) } });
  if (!escrow) throw new Error(`Escrow ${escrowId} not found`);

  const result = await scoreEscrow(escrow);

  if (result.flagged) {
    const reason = `Fraud signals: ${result.signals.join(', ')} (score: ${result.score})`;
    await Promise.all([
      prisma.adminAuditLog.create({ data: { action: 'FRAUD_FLAGGED',          targetAddress: escrow.clientAddress,     reason, performedBy: 'system:fraud-detector', performedAt: new Date() } }),
      prisma.adminAuditLog.create({ data: { action: 'REPUTATION_SUSPENDED',   targetAddress: escrow.clientAddress,     reason: `Pending fraud review for escrow ${escrowId}`, performedBy: 'system:fraud-detector', performedAt: new Date() } }),
      prisma.adminAuditLog.create({ data: { action: 'REPUTATION_SUSPENDED',   targetAddress: escrow.freelancerAddress, reason: `Pending fraud review for escrow ${escrowId}`, performedBy: 'system:fraud-detector', performedAt: new Date() } }),
    ]);
    console.warn(`[FraudDetector] Escrow ${escrowId} flagged — score=${result.score} signals=${result.signals.join(',')}`);
  }

  return result;
}

export async function isReputationSuspended(address) {
  try {
    const latest = await prisma.adminAuditLog.findFirst({
      where: { targetAddress: address, action: { in: ['REPUTATION_SUSPENDED', 'REPUTATION_RESTORED'] } },
      orderBy: { performedAt: 'desc' },
    });
    return latest?.action === 'REPUTATION_SUSPENDED';
  } catch { return false; }
}

export default { runFraudCheck, scoreEscrow, isReputationSuspended };
