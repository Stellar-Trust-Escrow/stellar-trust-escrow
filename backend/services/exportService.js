const prisma = require('../lib/prisma');

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
  async exportUserData(address) {
    const [escrows, payments, kyc, reputation] = await Promise.all([
      this.exportEscrowHistory(address),
      this.exportPaymentHistory(address),
      this.exportKycStatus(address),
      this.exportReputation(address),
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
      },
    };
  }

  /**
   * Export escrow history for a user (as client or freelancer)
   * @param {string} address - User's Stellar address
   * @returns {Promise<Array>} Array of escrow records
   */
  async exportEscrowHistory(address) {
    const escrows = await prisma.escrow.findMany({
      where: {
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
      deadline: escrow.deadline?.toISOString() || null,
      createdAt: escrow.createdAt.toISOString(),
      createdLedger: escrow.createdLedger.toString(),
      milestones: escrow.milestones.map((m) => ({
        milestoneIndex: m.milestoneIndex,
        title: m.title,
        descriptionHash: m.descriptionHash,
        amount: m.amount,
        status: m.status,
        submittedAt: m.submittedAt?.toISOString() || null,
        resolvedAt: m.resolvedAt?.toISOString() || null,
      })),
      dispute: escrow.dispute
        ? {
            raisedByAddress: escrow.dispute.raisedByAddress,
            raisedAt: escrow.dispute.raisedAt.toISOString(),
            resolvedAt: escrow.dispute.resolvedAt?.toISOString() || null,
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
  async exportPaymentHistory(address) {
    const payments = await prisma.payment.findMany({
      where: { address },
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
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
    }));
  }

  /**
   * Export KYC status for a user
   * @param {string} address - User's Stellar address
   * @returns {Promise<Object|null>} KYC record or null
   */
  async exportKycStatus(address) {
    const kyc = await prisma.kycVerification.findUnique({
      where: { address },
    });

    if (!kyc) return null;

    return {
      status: kyc.status,
      reviewResult: kyc.reviewResult,
      rejectLabels: kyc.rejectLabels,
      createdAt: kyc.createdAt.toISOString(),
      updatedAt: kyc.updatedAt.toISOString(),
    };
  }

  /**
   * Export reputation record for a user
   * @param {string} address - User's Stellar address
   * @returns {Promise<Object|null>} Reputation record or null
   */
  async exportReputation(address) {
    const reputation = await prisma.reputationRecord.findUnique({
      where: { address },
    });

    if (!reputation) return null;

    return {
      totalScore: reputation.totalScore.toString(),
      completedEscrows: reputation.completedEscrows,
      disputedEscrows: reputation.disputedEscrows,
      disputesWon: reputation.disputesWon,
      totalVolume: reputation.totalVolume,
      lastUpdated: reputation.lastUpdated.toISOString(),
      updatedAt: reputation.updatedAt.toISOString(),
    };
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

module.exports = new ExportService();
