import { createHash, randomUUID } from 'crypto';

import prisma from '../lib/prisma.js';
import { emailQueue } from '../queues/emailQueue.js';

function withTenant(where, tenantId) {
  return tenantId ? { ...where, tenantId } : where;
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : value ? new Date(value).toISOString() : null;
}

/**
 * Export/Import Service for Stellar Trust Escrow
 * Handles data portability - export all user data and import data in standard formats
 */

class ExportService {
  /**
   * Export all data for a user by Stellar address
   * @param {string} address - User's Stellar address
   * @returns {Promise<Object>} Complete user data export
   */
  async exportUserData(address, { tenantId } = {}) {
    const [escrows, payments, kyc, reputation, adminAuditLog, disputeMessages] = await Promise.all([
      this.exportEscrowHistory(address, { tenantId }),
      this.exportPaymentHistory(address, { tenantId }),
      this.exportKycStatus(address, { tenantId }),
      this.exportReputation(address, { tenantId }),
      this.exportAdminAuditLog(address, { tenantId }),
      this.exportDisputeMessages(address),
    ]);

    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      userAddress: address,
      data: {
        escrows,
        payments,
        kyc,
        reputation,
        adminAuditLog,
        disputeMessages,
      },
    };
  }

  /**
   * Export escrow history for a user (as client or freelancer)
   * @param {string} address - User's Stellar address
   * @returns {Promise<Array>} Array of escrow records
   */
  async exportEscrowHistory(address, { tenantId } = {}) {
    const escrows = await prisma.escrow.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        OR: [{ clientAddress: address }, { freelancerAddress: address }],
      },
      include: {
        milestones: true,
        dispute: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return escrows.map((escrow) => ({
      id: escrow.id.toString(),
      clientAddress: escrow.clientAddress,
      freelancerAddress: escrow.freelancerAddress,
      arbiterAddress: escrow.arbiterAddress,
      tokenAddress: escrow.tokenAddress,
      totalAmount: escrow.totalAmount,
      remainingBalance: escrow.remainingBalance,
      status: escrow.status,
      briefHash: escrow.briefHash,
      deadline: toIso(escrow.deadline),
      createdAt: toIso(escrow.createdAt),
      createdLedger: escrow.createdLedger.toString(),
      milestones: escrow.milestones.map((m) => ({
        milestoneIndex: m.milestoneIndex,
        title: m.title,
        descriptionHash: m.descriptionHash,
        amount: m.amount,
        status: m.status,
        submittedAt: toIso(m.submittedAt),
        resolvedAt: toIso(m.resolvedAt),
      })),
      dispute: escrow.dispute
        ? {
            raisedByAddress: escrow.dispute.raisedByAddress,
            raisedAt: toIso(escrow.dispute.raisedAt),
            resolvedAt: toIso(escrow.dispute.resolvedAt),
            clientAmount: escrow.dispute.clientAmount,
            freelancerAmount: escrow.dispute.freelancerAmount,
            resolvedBy: escrow.dispute.resolvedBy,
            resolution: escrow.dispute.resolution,
          }
        : null,
    }));
  }

  /**
   * Export payment history for a user
   * @param {string} address - User's Stellar address
   * @returns {Promise<Array>} Array of payment records
   */
  async exportPaymentHistory(address, { tenantId } = {}) {
    const payments = await prisma.payment.findMany({
      where: withTenant({ address }, tenantId),
      orderBy: { createdAt: 'desc' },
    });

    return payments.map((payment) => ({
      id: payment.id,
      escrowId: payment.escrowId?.toString() || null,
      stripeSessionId: payment.stripeSessionId,
      stripePaymentIntent: payment.stripePaymentIntent,
      amountFiat: payment.amountFiat,
      amountCrypto: payment.amountCrypto,
      currency: payment.currency,
      status: payment.status,
      refundId: payment.refundId,
      createdAt: toIso(payment.createdAt),
      updatedAt: toIso(payment.updatedAt),
    }));
  }

  /**
   * Export KYC status for a user
   * @param {string} address - User's Stellar address
   * @returns {Promise<Object|null>} KYC record or null
   */
  async exportKycStatus(address, { tenantId } = {}) {
    const kyc = tenantId
      ? await prisma.kycVerification.findFirst({ where: { address, tenantId } })
      : await prisma.kycVerification.findUnique({
          where: { address },
        });

    if (!kyc) return null;

    return {
      status: kyc.status,
      reviewResult: kyc.reviewResult,
      rejectLabels: kyc.rejectLabels,
      createdAt: toIso(kyc.createdAt),
      updatedAt: toIso(kyc.updatedAt),
    };
  }

  /**
   * Export reputation record for a user
   * @param {string} address - User's Stellar address
   * @returns {Promise<Object|null>} Reputation record or null
   */
  async exportReputation(address, { tenantId } = {}) {
    const reputation = tenantId
      ? await prisma.reputationRecord.findFirst({ where: { address, tenantId } })
      : await prisma.reputationRecord.findUnique({
          where: { address },
        });

    if (!reputation) return null;

    return {
      totalScore: reputation.totalScore.toString(),
      completedEscrows: reputation.completedEscrows,
      disputedEscrows: reputation.disputedEscrows,
      disputesWon: reputation.disputesWon,
      totalVolume: reputation.totalVolume,
      lastUpdated: toIso(reputation.lastUpdated),
      updatedAt: toIso(reputation.updatedAt),
    };
  }

  async exportAdminAuditLog(address, { tenantId } = {}) {
    const logs = await prisma.adminAuditLog.findMany({
      where: withTenant({ targetAddress: address }, tenantId),
      orderBy: { performedAt: 'desc' },
    });

    return logs.map((log) => ({
      action: log.action,
      targetAddress: log.targetAddress,
      timestamp: toIso(log.performedAt),
      outcome: log.reason || 'recorded',
    }));
  }

  async exportDisputeMessages(address) {
    if (!prisma.chatMessage || !prisma.chatRoomKey) return [];

    const roomKeys = await prisma.chatRoomKey.findMany({
      where: { address },
      select: { roomId: true },
    });
    const roomIds = [...new Set(roomKeys.map((key) => key.roomId).filter(Boolean))];

    const messages = await prisma.chatMessage.findMany({
      where: {
        OR: [{ senderAddress: address }, ...(roomIds.length ? [{ roomId: { in: roomIds } }] : [])],
      },
      orderBy: { sentAt: 'asc' },
      select: {
        id: true,
        roomId: true,
        senderAddress: true,
        ciphertext: true,
        iv: true,
        tag: true,
        sentAt: true,
      },
    });

    return messages.map((message) => ({
      id: message.id,
      roomId: message.roomId,
      senderAddress: message.senderAddress,
      ciphertext: message.ciphertext,
      iv: message.iv,
      tag: message.tag,
      sentAt: toIso(message.sentAt),
    }));
  }

  async logAdminExport(address, { tenantId, performedBy = 'admin' } = {}) {
    return prisma.adminAuditLog.create({
      data: {
        ...(tenantId ? { tenantId } : {}),
        action: 'DATA_EXPORT',
        targetAddress: address,
        reason: 'Admin exported user data',
        performedBy,
        performedAt: new Date(),
      },
    });
  }

  async queueLargeExport(address, { tenantId, requestedBy } = {}) {
    const token = randomUUID();
    const downloadUrl = `/api/users/${address}/export/file?token=${token}`;
    const user = await prisma.user?.findFirst?.({
      where: withTenant({ walletAddress: address }, tenantId),
      select: { email: true },
    });

    const job = await emailQueue.add('data_export.deliver', {
      address,
      tenantId,
      requestedBy,
      downloadUrl,
      recipients: user?.email ? [{ email: user.email }] : [],
      message: {
        subject: 'Your Stellar Trust Escrow data export is ready',
        text: `Your data export is ready: ${downloadUrl}`,
      },
    });

    return { jobId: job.id, downloadUrl };
  }

  pseudonymForAddress(address) {
    return `anon_${createHash('sha256').update(address).digest('hex').slice(0, 32)}`;
  }

  async pseudonymizeUserData(address, { tenantId, performedBy = 'admin' } = {}) {
    const pseudonym = this.pseudonymForAddress(address);
    const scoped = (where) => withTenant(where, tenantId);

    const result = await prisma.$transaction(async (tx) => {
      const [
        escrowsAsClient,
        escrowsAsFreelancer,
        escrowsAsArbiter,
        payments,
        kyc,
        reputation,
        profiles,
        users,
      ] = await Promise.all([
        tx.escrow.updateMany({
          where: scoped({ clientAddress: address }),
          data: { clientAddress: pseudonym },
        }),
        tx.escrow.updateMany({
          where: scoped({ freelancerAddress: address }),
          data: { freelancerAddress: pseudonym },
        }),
        tx.escrow.updateMany({
          where: scoped({ arbiterAddress: address }),
          data: { arbiterAddress: pseudonym },
        }),
        tx.payment.updateMany({
          where: scoped({ address }),
          data: { address: pseudonym },
        }),
        tx.kycVerification.updateMany({
          where: scoped({ address }),
          data: { address: pseudonym, applicantId: null, rejectLabels: [] },
        }),
        tx.reputationRecord.updateMany({
          where: scoped({ address }),
          data: { address: pseudonym },
        }),
        tx.userProfile.updateMany({
          where: scoped({ address }),
          data: { address: pseudonym, displayName: null, bio: null, avatarUrl: null },
        }),
        tx.user.updateMany({
          where: scoped({ walletAddress: address }),
          data: { walletAddress: pseudonym, email: `${pseudonym}@deleted.local` },
        }),
      ]);

      await tx.adminAuditLog.create({
        data: {
          ...(tenantId ? { tenantId } : {}),
          action: 'GDPR_DATA_PSEUDONYMIZE',
          targetAddress: pseudonym,
          reason: 'Pseudonymized user data',
          performedBy,
          performedAt: new Date(),
        },
      });

      return {
        pseudonym,
        updated: {
          escrowsAsClient: escrowsAsClient.count,
          escrowsAsFreelancer: escrowsAsFreelancer.count,
          escrowsAsArbiter: escrowsAsArbiter.count,
          payments: payments.count,
          kyc: kyc.count,
          reputation: reputation.count,
          profiles: profiles.count,
          users: users.count,
        },
      };
    });

    return result;
  }

  /**
   * Validate imported data structure
   * @param {Object} data - Data to validate
   * @returns {Object} Validation result with isValid flag and errors
   */
  validateImportData(data) {
    const errors = [];

    // Check required fields
    if (!data.version || typeof data.version !== 'string') {
      errors.push('Missing or invalid version field');
    }

    if (!data.userAddress || typeof data.userAddress !== 'string') {
      errors.push('Missing or invalid userAddress field');
    }

    if (!data.data || typeof data.data !== 'object') {
      errors.push('Missing or invalid data object');
    }

    // Validate data structure if present
    if (data.data) {
      if (data.data.escrows && !Array.isArray(data.data.escrows)) {
        errors.push('escrows must be an array');
      }

      if (data.data.payments && !Array.isArray(data.data.payments)) {
        errors.push('payments must be an array');
      }

      if (data.data.kyc && typeof data.data.kyc !== 'object') {
        errors.push('kyc must be an object');
      }

      if (data.data.reputation && typeof data.data.reputation !== 'object') {
        errors.push('reputation must be an object');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Merge imported data with existing data
   * @param {string} address - User's Stellar address
   * @param {Object} data - Validated import data
   * @param {string} mode - Merge mode: 'merge' | 'replace'
   * @returns {Promise<Object>} Merge result
   */
  async mergeImportData(address, data, mode = 'merge') {
    const results = {
      escrows: { imported: 0, skipped: 0, errors: [] },
      payments: { imported: 0, skipped: 0, errors: [] },
      reputation: { imported: 0, skipped: 0, errors: [] },
    };

    if (mode === 'replace') {
      // In replace mode, we don't delete existing data but mark as replaced
      // For now, we'll treat it same as merge
    }

    // Import escrows (only new ones that don't exist)
    if (data.data.escrows && Array.isArray(data.data.escrows)) {
      for (const escrow of data.data.escrows) {
        try {
          const existing = await prisma.escrow.findUnique({
            where: { id: BigInt(escrow.id) },
          });

          if (!existing) {
            await prisma.escrow.create({
              data: {
                id: BigInt(escrow.id),
                clientAddress: escrow.clientAddress,
                freelancerAddress: escrow.freelancerAddress,
                arbiterAddress: escrow.arbiterAddress,
                tokenAddress: escrow.tokenAddress,
                totalAmount: escrow.totalAmount,
                remainingBalance: escrow.remainingBalance,
                status: escrow.status,
                briefHash: escrow.briefHash,
                deadline: escrow.deadline ? new Date(escrow.deadline) : null,
                createdAt: new Date(escrow.createdAt),
                createdLedger: BigInt(escrow.createdLedger),
              },
            });

            // Import milestones
            if (escrow.milestones && Array.isArray(escrow.milestones)) {
              for (const milestone of escrow.milestones) {
                await prisma.milestone.upsert({
                  where: {
                    escrowId_milestoneIndex: {
                      escrowId: BigInt(escrow.id),
                      milestoneIndex: milestone.milestoneIndex,
                    },
                  },
                  create: {
                    milestoneIndex: milestone.milestoneIndex,
                    escrowId: BigInt(escrow.id),
                    title: milestone.title,
                    descriptionHash: milestone.descriptionHash,
                    amount: milestone.amount,
                    status: milestone.status,
                    submittedAt: milestone.submittedAt ? new Date(milestone.submittedAt) : null,
                    resolvedAt: milestone.resolvedAt ? new Date(milestone.resolvedAt) : null,
                  },
                  update: milestone,
                });
              }
            }

            results.escrows.imported++;
          } else {
            results.escrows.skipped++;
          }
        } catch (err) {
          results.escrows.errors.push(`Failed to import escrow ${escrow.id}: ${err.message}`);
        }
      }
    }

    // Import payments
    if (data.data.payments && Array.isArray(data.data.payments)) {
      for (const payment of data.data.payments) {
        try {
          const existing = await prisma.payment.findUnique({
            where: { id: payment.id },
          });

          if (!existing) {
            await prisma.payment.create({
              data: {
                id: payment.id,
                address: address,
                escrowId: payment.escrowId ? BigInt(payment.escrowId) : null,
                stripeSessionId: payment.stripeSessionId,
                stripePaymentIntent: payment.stripePaymentIntent,
                amountFiat: payment.amountFiat,
                amountCrypto: payment.amountCrypto,
                currency: payment.currency || 'usd',
                status: payment.status,
                refundId: payment.refundId,
              },
            });
            results.payments.imported++;
          } else {
            results.payments.skipped++;
          }
        } catch (err) {
          results.payments.errors.push(`Failed to import payment ${payment.id}: ${err.message}`);
        }
      }
    }

    // Import/update reputation
    if (data.data.reputation && typeof data.data.reputation === 'object') {
      try {
        const rep = data.data.reputation;
        await prisma.reputationRecord.upsert({
          where: { address },
          create: {
            address,
            totalScore: BigInt(rep.totalScore || 0),
            completedEscrows: rep.completedEscrows || 0,
            disputedEscrows: rep.disputedEscrows || 0,
            disputesWon: rep.disputesWon || 0,
            totalVolume: rep.totalVolume || '0',
            lastUpdated: rep.lastUpdated ? new Date(rep.lastUpdated) : new Date(),
          },
          update: {
            totalScore: BigInt(rep.totalScore || 0),
            completedEscrows: rep.completedEscrows || 0,
            disputedEscrows: rep.disputedEscrows || 0,
            disputesWon: rep.disputesWon || 0,
            totalVolume: rep.totalVolume || '0',
            lastUpdated: rep.lastUpdated ? new Date(rep.lastUpdated) : new Date(),
          },
        });
        results.reputation.imported++;
      } catch (err) {
        results.reputation.errors.push(`Failed to import reputation: ${err.message}`);
      }
    }

    return results;
  }

  /**
   * Generate downloadable JSON file content
   * @param {Object} data - Data to export
   * @returns {string} JSON string
   */
  generateExportFile(data) {
    return JSON.stringify(data, null, 2);
  }

  /**
   * Parse uploaded file content
   * @param {string} content - File content string
   * @returns {Object} Parsed data
   */
  parseImportFile(content) {
    try {
      const data = JSON.parse(content);
      return { success: true, data };
    } catch {
      return { success: false, error: 'Invalid JSON format' };
    }
  }
}

export default new ExportService();
