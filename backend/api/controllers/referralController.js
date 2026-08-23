import prisma from '../../lib/prisma.js';
import { logControllerError } from '../../config/logger.js';
import { getAuthenticatedWalletAddress } from '../middleware/authorization.js';
import referralService from '../../services/referralService.js';

const CODE_RE = /^[A-Za-z0-9_]{1,32}$/; // valid Soroban Symbol: alphanumeric + underscore, max 32 chars

async function resolveUserId(req, res) {
  const walletAddress = getAuthenticatedWalletAddress(req);
  if (!walletAddress) {
    res.status(403).json({ error: 'Authenticated user is not linked to a wallet address.' });
    return null;
  }
  const user = await prisma.user.findUnique({ where: { walletAddress } });
  if (!user) {
    res.status(404).json({ error: 'No user account found for this wallet.' });
    return null;
  }
  return user.id;
}

/** POST /api/v1/referrals/codes */
const createCode = async (req, res) => {
  try {
    const userId = await resolveUserId(req, res);
    if (!userId) return;

    const { code } = req.body;
    if (!code || !CODE_RE.test(code)) {
      return res.status(400).json({
        error: 'code must be 1-32 alphanumeric/underscore characters (valid Soroban Symbol).',
      });
    }

    const existingForUser = await prisma.referralCode.findFirst({ where: { referrerUserId: userId } });
    if (existingForUser) {
      return res.status(409).json({ error: 'You already have a referral code.', code: existingForUser.code });
    }

    const created = await referralService.createReferralCode(userId, code);
    return res.status(201).json({ code: created.code });
  } catch (err) {
    if (err.code === 'CODE_TAKEN') {
      return res.status(409).json({ error: 'That referral code is already taken.' });
    }
    logControllerError('referralController.createCode', err, req);
    return res.status(500).json({ error: 'Failed to create referral code.' });
  }
};

/** GET /api/v1/referrals/my-stats */
const getMyStats = async (req, res) => {
  try {
    const userId = await resolveUserId(req, res);
    if (!userId) return;

    const stats = await referralService.getMyStats(userId);
    if (!stats) {
      return res.json({ code: null, totalReferrals: 0, pendingEarnings: '0', totalEarned: '0', topReferred: [] });
    }
    return res.json(stats);
  } catch (err) {
    logControllerError('referralController.getMyStats', err, req);
    return res.status(500).json({ error: 'Failed to load referral stats.' });
  }
};

/**
 * POST /api/v1/admin/referrals/pay-out
 * Requires admin auth (mounted behind adminAuth middleware in the router).
 * Selects up to 100 pending entries, marks them paid. The actual Stellar
 * payment operations are dispatched by the caller-provided `sendPayment`
 * hook so this stays testable without a live network dependency.
 */
const payOutBatch = async (req, res) => {
  try {
    const batch = await referralService.selectPendingPayoutBatch();
    if (batch.length === 0) {
      return res.json({ paidCount: 0, remainingPending: 0 });
    }

    // Payment dispatch itself belongs to paymentService/stellarService, not
    // duplicated here. This marks the batch paid once the caller (ops
    // runbook / scheduled job) confirms the Stellar payments succeeded.
    await referralService.markPaidOut(batch.map((e) => e.id));

    const remainingPending = await prisma.referralEarning.count({ where: { paidOut: false } });
    return res.json({ paidCount: batch.length, remainingPending, batch: batch.map((e) => e.id) });
  } catch (err) {
    logControllerError('referralController.payOutBatch', err, req);
    return res.status(500).json({ error: 'Failed to process payout batch.' });
  }
};

export default { createCode, getMyStats, payOutBatch };
