import prisma from '../lib/prisma.js';
import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('kycService');

class DomainError extends Error {
  constructor(message, code, status = 409) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * Initiate KYC for an address — creates/upserts a KycVerification row with
 * status=Pending and returns a stub applicantId + sdkToken.
 */
export async function initiateKyc({ userId, address, tenantId }) {
  if (!address) throw new DomainError('address is required', 'MISSING_ADDRESS', 400);

  const applicantId = `applicant_${address}`;
  const sdkToken = `token_${address}`;

  await prisma.kycVerification.upsert({
    where: { address },
    update: {},
    create: {
      tenantId,
      address,
      applicantId,
      status: 'Pending',
    },
  });

  logger.info({ msg: 'kyc_initiated', address, applicantId });

  return { applicantId, sdkToken };
}

/**
 * Return KycVerification record for the given address, or { status: 'unverified' }
 * if no record exists.
 */
export async function getKycStatus({ address, tenantId }) {
  if (!address) throw new DomainError('address is required', 'MISSING_ADDRESS', 400);

  const record = await prisma.kycVerification.findUnique({ where: { address } });
  return record ?? { status: 'unverified' };
}

/**
 * Process a Sumsub webhook event.
 * HMAC must be verified by the controller before calling this function.
 * Idempotent: if the same applicantId + reviewAnswer combo was already processed,
 * returns the existing record without writing a duplicate.
 */
export async function processWebhook({
  applicantId,
  eventType,
  reviewAnswer,
  rejectionLabels = [],
  rawPayload,
  tenantId,
}) {
  if (!applicantId) throw new DomainError('applicantId is required', 'MISSING_APPLICANT_ID', 400);

  const existing = await prisma.kycVerification.findUnique({ where: { applicantId } });

  const isGreen = reviewAnswer === 'GREEN';
  const isRed = reviewAnswer === 'RED';

  // Idempotency: if same outcome already recorded, skip update
  if (existing) {
    if (isGreen && existing.status === 'Approved') {
      logger.info({ msg: 'kyc_webhook_idempotent', applicantId, status: 'Approved' });
      await _logWebhook({ applicantId, eventType, rawPayload });
      return { processed: true, status: 'Approved' };
    }
    if (isRed && existing.status === 'Declined') {
      logger.info({ msg: 'kyc_webhook_idempotent', applicantId, status: 'Declined' });
      await _logWebhook({ applicantId, eventType, rawPayload });
      return { processed: true, status: 'Declined' };
    }
  }

  let newStatus;
  let updateData;

  if (isGreen) {
    newStatus = 'Approved';
    updateData = { status: 'Approved', reviewResult: 'approved', rejectLabels: [] };
  } else if (isRed) {
    newStatus = 'Declined';
    updateData = {
      status: 'Declined',
      reviewResult: 'declined',
      rejectLabels: rejectionLabels ?? [],
    };
  } else {
    newStatus = 'Processing';
    updateData = { status: 'Processing', reviewResult: eventType ?? null };
  }

  if (existing) {
    await prisma.kycVerification.update({
      where: { applicantId },
      data: updateData,
    });
  } else {
    logger.warn({ msg: 'kyc_webhook_no_record', applicantId });
  }

  await _logWebhook({ applicantId, eventType, rawPayload });

  logger.info({ msg: 'kyc_webhook_processed', applicantId, status: newStatus });
  return { processed: true, status: newStatus };
}

async function _logWebhook({ applicantId, eventType, rawPayload }) {
  try {
    await prisma.kycWebhookLog.create({
      data: {
        applicantId,
        eventType: eventType ?? 'unknown',
        rawPayload: rawPayload ?? {},
      },
    });
  } catch (err) {
    logger.warn({ msg: 'kyc_webhook_log_failed', applicantId, error: err.message });
  }
}

/**
 * Admin override — force a KYC status, log to AdminAuditLog.
 */
export async function adminOverride({ userId, targetAddress, newStatus, tenantId, adminId }) {
  if (!targetAddress) throw new DomainError('targetAddress is required', 'MISSING_ADDRESS', 400);
  if (!newStatus) throw new DomainError('newStatus is required', 'MISSING_STATUS', 400);

  const record = await prisma.kycVerification.findUnique({ where: { address: targetAddress } });
  if (!record) {
    throw new DomainError('KYC record not found', 'KYC_NOT_FOUND', 404);
  }

  await prisma.kycVerification.update({
    where: { address: targetAddress },
    data: { status: newStatus },
  });

  await prisma.adminAuditLog.create({
    data: {
      tenantId,
      action: 'KYC_OVERRIDE',
      targetAddress,
      reason: `Admin override to ${newStatus}`,
      performedBy: adminId ?? 'admin',
      performedAt: new Date(),
    },
  });

  logger.info({ msg: 'kyc_admin_override', targetAddress, newStatus, adminId });
  return { success: true, address: targetAddress, status: newStatus };
}

/**
 * List KYC verifications with status Pending or Declined, paginated.
 */
export async function listPending({ tenantId, page = 1, limit = 20 } = {}) {
  const skip = (page - 1) * limit;

  const [records, total] = await Promise.all([
    prisma.kycVerification.findMany({
      where: { status: { in: ['Pending', 'Declined'] } },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.kycVerification.count({
      where: { status: { in: ['Pending', 'Declined'] } },
    }),
  ]);

  return { records, total, page, limit };
}
