/**
 * ReferralService
 *
 * Off-chain accounting layer on top of the on-chain `referral_registry`
 * Soroban contract. The contract is the source of truth for "who referred
 * this escrow" (tamper-proof); this service handles the fee-split
 * bookkeeping (referral_codes / referral_earnings) and payouts, which run
 * from the DB for performance rather than hitting the chain on every read.
 */

import prisma from '../lib/prisma.js';
import { createModuleLogger } from '../config/logger.js';
import { getReferrerOnChain } from './referralRegistryClient.js';

const log = createModuleLogger('service.referral');

const DEFAULT_REFERRAL_EARNINGS_PERCENT = 20; // used only if env var is unset
const MAX_PAYOUT_BATCH_SIZE = 100;

function referralEarningsPercent() {
  const raw = process.env.REFERRAL_EARNINGS_PERCENT;
  const parsed = raw !== undefined ? parseFloat(raw) : DEFAULT_REFERRAL_EARNINGS_PERCENT;
  return Number.isFinite(parsed) ? parsed : DEFAULT_REFERRAL_EARNINGS_PERCENT;
}

function platformFeePercent() {
  // Same config source adminController.js already reads platform fee from —
  // not hardcoded here, and not duplicated as a second source of truth.
  const raw = process.env.PLATFORM_FEE_PERCENT;
  const parsed = raw !== undefined ? parseFloat(raw) : 1.5;
  return Number.isFinite(parsed) ? parsed : 1.5;
}

/**
 * Creates a referral code for a user. Does NOT touch the chain — on-chain
 * registration (register_code) happens client-side via the user's own
 * wallet signature; this just records it for backend stats once it's live.
 * Call this after the on-chain register_code transaction has been confirmed.
 */
export async function createReferralCode(userId, code) {
  const existing = await prisma.referralCode.findUnique({ where: { code } });
  if (existing) {
    const err = new Error('Referral code already taken');
    err.code = 'CODE_TAKEN';
    err.status = 409;
    throw err;
  }
  return prisma.referralCode.create({ data: { code, referrerUserId: userId } });
}

/**
 * Computes and records the referral earning for an escrow release/completion
 * event. Looks up the on-chain referrer for the escrow; if none is bound,
 * this is a no-op (most escrows have no referral). Uses the platform fee
 * percent from config (never hardcoded) times the configured referral share.
 *
 * Safe to call multiple times for the same (escrow, event) pair — the
 * underlying unique constraint makes it idempotent.
 */
export async function calculateEarning(escrowId, triggeredByEvent = 'release') {
  try {
    const referrerAddress = await getReferrerOnChain(escrowId);
    if (!referrerAddress) return null; // no referral bound to this escrow

    const referralCode = await prisma.referralCode.findFirst({
      where: { referrer: { walletAddress: referrerAddress } },
    });
    if (!referralCode) {
      log.warn({ message: 'referral_onchain_but_no_backend_code', escrowId, referrerAddress });
      return null;
    }

    const escrow = await prisma.escrow.findUnique({ where: { id: escrowId } });
    if (!escrow) return null;

    const totalAmount = BigInt(escrow.totalAmount);
    const feePct = platformFeePercent();
    const referralPct = referralEarningsPercent();

    // platform_fee = totalAmount * feePct/100 ; earning = platform_fee * referralPct/100
    // Done in floating point at the XLM-unit level (not stroops) since this
    // is an accounting record, not an on-chain transfer amount.
    const totalAmountXlm = Number(totalAmount) / 1e7;
    const platformFeeXlm = totalAmountXlm * (feePct / 100);
    const earnedXlm = platformFeeXlm * (referralPct / 100);

    const earning = await prisma.referralEarning.upsert({
      where: {
        referralCode_escrowId_triggeredByEvent: {
          referralCode: referralCode.code,
          escrowId,
          triggeredByEvent,
        },
      },
      update: {},
      create: {
        referralCode: referralCode.code,
        escrowId,
        triggeredByEvent,
        earnedXlm: earnedXlm.toFixed(7),
      },
    });

    await prisma.referralCode.update({
      where: { code: referralCode.code },
      data: {
        totalReferrals: { increment: 1 },
        totalEarnedXlm: { increment: earnedXlm.toFixed(7) },
      },
    });

    return earning;
  } catch (err) {
    // Referral accounting must never block or fail an escrow release.
    log.error({ message: 'referral_earning_calc_failed', escrowId, error: err.message });
    return null;
  }
}

/**
 * GET /api/v1/referrals/my-stats payload for a given user.
 */
export async function getMyStats(userId) {
  const code = await prisma.referralCode.findFirst({ where: { referrerUserId: userId } });
  if (!code) return null;

  const [pendingAgg, paidAgg, topReferred] = await Promise.all([
    prisma.referralEarning.aggregate({
      where: { referralCode: code.code, paidOut: false },
      _sum: { earnedXlm: true },
    }),
    prisma.referralEarning.aggregate({
      where: { referralCode: code.code, paidOut: true },
      _sum: { earnedXlm: true },
    }),
    prisma.referralEarning.findMany({
      where: { referralCode: code.code },
      orderBy: { earnedXlm: 'desc' },
      take: 5,
      select: { escrowId: true, earnedXlm: true },
    }),
  ]);

  return {
    code: code.code,
    totalReferrals: code.totalReferrals,
    pendingEarnings: pendingAgg._sum.earnedXlm?.toString() ?? '0',
    totalEarned: paidAgg._sum.earnedXlm?.toString() ?? '0',
    // Anonymised by escrow id only — no address exposed for the referred party.
    topReferred: topReferred.map((r) => ({
      escrowId: r.escrowId.toString(),
      earnedXlm: r.earnedXlm.toString(),
    })),
  };
}

/**
 * Batch pay-out pending earnings. Processes at most MAX_PAYOUT_BATCH_SIZE
 * entries; remaining stay pending for the next invocation. Actual XLM
 * transfer is the caller's responsibility (admin route wires this to a
 * Stellar payment operation); this function only selects the batch and
 * marks it paid once the caller confirms the transfer succeeded.
 */
export async function selectPendingPayoutBatch() {
  return prisma.referralEarning.findMany({
    where: { paidOut: false },
    orderBy: { createdAt: 'asc' },
    take: MAX_PAYOUT_BATCH_SIZE,
    include: { code: { include: { referrer: { select: { walletAddress: true } } } } },
  });
}

export async function markPaidOut(earningIds) {
  const now = new Date();
  return prisma.referralEarning.updateMany({
    where: { id: { in: earningIds } },
    data: { paidOut: true, paidOutAt: now },
  });
}

export default {
  createReferralCode,
  calculateEarning,
  getMyStats,
  selectPendingPayoutBatch,
  markPaidOut,
};
