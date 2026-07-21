import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { getQueue } from '../queues/factory.js';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL);
const fraudQueue = getQueue('fraud:case:created');

const RULES = {
  HIGH_VELOCITY_CREATE: { score: 40, windowMs: 3600 * 1000, limit: 5 },
  RAPID_DISPUTE: { score: 60, windowMs: 120 * 1000 },
  MULTI_FREELANCER: { score: 30, windowMs: 24 * 3600 * 1000, limit: 3 },
  AMOUNT_SPIKE: { score: 50, windowMs: 30 * 24 * 3600 * 1000 },
  NEW_ACCOUNT_HIGH_VALUE: { score: 45, value: 5000, windowDays: 7 },
  REPEAT_DISPUTE: { score: 35, windowMs: 30 * 24 * 3600 * 1000, limit: 2 },
};

const THRESHOLDS = {
  ALLOW: 49,
  REVIEW: 79,
  BLOCK: 80,
};

/**
 * Implements a sliding window counter in Redis.
 * @param {string} key - The Redis key.
 * @param {number} windowMs - The window size in milliseconds.
 * @returns {Promise<number>} - The current count in the window.
 */
async function incrementSlidingWindow(key, windowMs) {
  const now = Date.now();
  const multi = redis.multi();
  const member = `${now}-${uuidv4()}`;

  // Remove old entries
  multi.zremrangebyscore(key, 0, now - windowMs);
  // Add new entry
  multi.zadd(key, now, member);
  // Get current count
  multi.zcard(key);
  // Set key expiry to be helpful
  multi.pexpire(key, windowMs);

  const [, , count] = await multi.exec();
  return count[1];
}

/**
 * Evaluate all rules for an event.
 * @param {string} eventType - The type of event (e.g., 'create_escrow', 'raise_dispute').
 * @param {object} context - The event context: { userId, escrowId, amount, counterpartyId, timestamp }.
 * @returns {Promise<{ score: number, labels: string[], action: 'allow' | 'review' | 'block' }>}
 */
export async function evaluateEvent(eventType, context) {
  let score = 0;
  const labels = [];

  const user = await prisma.user.findUnique({ where: { id: context.userId } });
  if (!user) {
    // Cannot score if user doesn't exist, treat as high risk
    return { score: 100, labels: ['UNKNOWN_USER'], action: 'block' };
  }

  if (eventType === 'create_escrow') {
    // --- HIGH_VELOCITY_CREATE ---
    const createKey = `fraud:${context.userId}:create_escrow`;
    const createCount = await incrementSlidingWindow(createKey, RULES.HIGH_VELOCITY_CREATE.windowMs);
    if (createCount > RULES.HIGH_VELOCITY_CREATE.limit) {
      score += RULES.HIGH_VELOCITY_CREATE.score;
      labels.push('HIGH_VELOCITY_CREATE');
    }

    // --- MULTI_FREELANCER ---
    const freelancerKey = `fraud:${context.userId}:unique_freelancers`;
    await redis.zadd(freelancerKey, Date.now(), context.counterpartyId);
    await redis.zremrangebyscore(freelancerKey, 0, Date.now() - RULES.MULTI_FREELANCER.windowMs);
    const freelancerCount = await redis.zcard(freelancerKey);
    if (freelancerCount > RULES.MULTI_FREELANCER.limit) {
        score += RULES.MULTI_FREELANCER.score;
        labels.push('MULTI_FREELANCER');
    }

    // --- AMOUNT_SPIKE ---
    const thirtyDaysAgo = new Date(Date.now() - RULES.AMOUNT_SPIKE.windowMs);
    const userEscrows = await prisma.escrow.findMany({
        where: { userId: context.userId, createdAt: { gte: thirtyDaysAgo } },
        select: { amount: true },
        orderBy: { amount: 'asc' },
    });
    if (userEscrows.length > 1) {
        const amounts = userEscrows.map(e => e.amount);
        const mid = Math.floor(amounts.length / 2);
        const median = amounts.length % 2 !== 0 ? amounts[mid] : (amounts[mid - 1] + amounts[mid]) / 2;
        if (context.amount > median * 10) {
            score += RULES.AMOUNT_SPIKE.score;
            labels.push('AMOUNT_SPIKE');
        }
    }

    // --- NEW_ACCOUNT_HIGH_VALUE ---
    const accountAgeDays = (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 3600 * 24);
    if (accountAgeDays < RULES.NEW_ACCOUNT_HIGH_VALUE.windowDays && context.amount > RULES.NEW_ACCOUNT_HIGH_VALUE.value) {
        score += RULES.NEW_ACCOUNT_HIGH_VALUE.score;
        labels.push('NEW_ACCOUNT_HIGH_VALUE');
    }
  }

  if (eventType === 'raise_dispute') {
    const escrow = await prisma.escrow.findUnique({ where: { id: context.escrowId } });
    // --- RAPID_DISPUTE ---
    if (escrow) {
        const fundedAt = new Date(escrow.fundedAt || escrow.createdAt).getTime();
        if (context.timestamp - fundedAt < RULES.RAPID_DISPUTE.windowMs) {
            score += RULES.RAPID_DISPUTE.score;
            labels.push('RAPID_DISPUTE');
        }
    }

    // --- REPEAT_DISPUTE ---
    const disputeKey = `fraud:${context.userId}:raise_dispute`;
    const disputeCount = await incrementSlidingWindow(disputeKey, RULES.REPEAT_DISPUTE.windowMs);
    if (disputeCount > RULES.REPEAT_DISPUTE.limit) {
        score += RULES.REPEAT_DISPUTE.score;
        labels.push('REPEAT_DISPUTE');
    }
  }

  score = Math.min(score, 100); // Cap score at 100

  let action = 'allow';
  if (score >= THRESHOLDS.BLOCK) {
    action = 'block';
  } else if (score >= THRESHOLDS.REVIEW) {
    action = 'review';
  }

  return { score, labels, action };
}

/**
 * Record a fraud case for manual review.
 * @param {string} userId - The user ID associated with the case.
 * @param {number} score - The calculated fraud score.
 * @param {string[]} labels - The fraud labels that were triggered.
 * @param {object} eventContext - The full context of the event that was flagged.
 * @returns {Promise<import('@prisma/client').FraudCase>}
 */
export async function createCase(userId, score, labels, eventContext) {
  const newCase = await prisma.fraudCase.create({
    data: {
      userId,
      score,
      labels,
      eventContext,
      status: 'open',
    },
  });

  // Emit a job for real-time admin notification
  await fraudQueue.add('new-case', { caseId: newCase.id, userId, score });

  return newCase;
}

/**
 * Admin resolves a case.
 * @param {string} caseId - The ID of the case to resolve.
 * @param {'false_positive' | 'confirmed_fraud'} resolution - The resolution status.
 * @param {string} resolvedBy - The ID of the admin resolving the case.
 * @returns {Promise<import('@prisma/client').FraudCase | null>}
 */
export async function resolveCase(caseId, resolution, resolvedBy) {
  const validResolutions = ['false_positive', 'confirmed_fraud'];
  if (!validResolutions.includes(resolution)) {
    const error = new Error('Invalid resolution string');
    error.statusCode = 400;
    throw error;
  }

  const updatedCase = await prisma.fraudCase.update({
    where: { id: caseId },
    data: {
      status: 'resolved',
      resolution,
      resolvedBy,
      resolvedAt: new Date(),
    },
  });

  return updatedCase;
}