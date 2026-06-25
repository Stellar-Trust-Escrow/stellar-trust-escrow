/**
 * Dispute Auto-Escalation Job
 *
 * Queries for open disputes that have had no arbiter activity within the
 * configured inactivity timeout, then:
 *   1. Increments escalation_count and sets escalated_at
 *   2. Writes an ESCALATE_DISPUTE audit log entry
 *   3. Sends an admin alert email/notification
 *
 * Default inactivity timeout: 48 hours (configurable per tenant via
 * tenant.configuration.disputeEscalationHours).
 *
 * Intended to be called every 30 minutes by the scheduler.
 */

import prisma from '../lib/prisma.js';
import { log, AuditCategory, AuditAction } from './auditService.js';
import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('disputeEscalation');

/** Default inactivity threshold in hours */
const DEFAULT_ESCALATION_HOURS = Number(process.env.DISPUTE_ESCALATION_HOURS ?? 48);

/** Admin email to notify on escalation (optional) */
const ADMIN_ALERT_EMAIL = process.env.ADMIN_ALERT_EMAIL ?? null;

/**
 * Resolve the inactivity threshold (in ms) for a given tenant.
 *
 * Tenants can override via tenant.configuration.disputeEscalationHours.
 *
 * @param {object|null} tenantConfig - tenant.configuration JSON
 * @returns {number} milliseconds
 */
function escalationThresholdMs(tenantConfig) {
  const hours = Number(tenantConfig?.disputeEscalationHours ?? DEFAULT_ESCALATION_HOURS);
  return (isFinite(hours) && hours > 0 ? hours : DEFAULT_ESCALATION_HOURS) * 3_600_000;
}

/**
 * Send an admin notification for an escalated dispute.
 * Uses email queue when configured; falls back to console warning.
 *
 * @param {object} dispute
 */
async function notifyAdmin(dispute) {
  const message = `Dispute #${dispute.id} (escrow ${dispute.escrowId}) has been auto-escalated. ` +
    `Escalation count: ${dispute.escalationCount + 1}. Raised: ${dispute.raisedAt.toISOString()}.`;

  if (ADMIN_ALERT_EMAIL) {
    try {
      const { enqueueEvent } = await import('../queues/emailQueue.js');
      await enqueueEvent({
        to: ADMIN_ALERT_EMAIL,
        subject: `[ESCALATION] Dispute #${dispute.id} requires senior arbiter attention`,
        text: message,
      });
    } catch (err) {
      logger.warn({ message: 'admin_email_failed', disputeId: dispute.id, error: err.message });
    }
  } else {
    logger.warn({ message: 'dispute_escalated_no_admin_email', disputeId: dispute.id, text: message });
  }
}

/**
 * Run the escalation check across all tenants.
 *
 * For each tenant, find open disputes whose last activity (raisedAt or
 * escalatedAt) is older than the tenant's escalation threshold, then
 * escalate them.
 *
 * @returns {Promise<number>} count of escalated disputes
 */
export async function runDisputeEscalationJob() {
  logger.info({ message: 'dispute_escalation_job_start' });

  // Load all active tenants with their configuration
  const tenants = await prisma.tenant.findMany({
    where: { status: 'active' },
    select: { id: true, slug: true, configuration: true },
  });

  let totalEscalated = 0;

  for (const tenant of tenants) {
    const thresholdMs = escalationThresholdMs(tenant.configuration);
    const cutoff = new Date(Date.now() - thresholdMs);

    // Find unresolved disputes with no recent activity
    const disputes = await prisma.dispute.findMany({
      where: {
        tenantId: tenant.id,
        resolvedAt: null,
        // Activity = the later of raisedAt or escalatedAt
        AND: [
          { raisedAt: { lt: cutoff } },
          {
            OR: [
              { escalatedAt: null },
              { escalatedAt: { lt: cutoff } },
            ],
          },
        ],
      },
      select: {
        id: true,
        escrowId: true,
        raisedByAddress: true,
        raisedAt: true,
        escalatedAt: true,
        escalationCount: true,
        tenantId: true,
      },
    });

    for (const dispute of disputes) {
      try {
        await prisma.dispute.update({
          where: { id: dispute.id },
          data: {
            escalatedAt: new Date(),
            escalationCount: { increment: 1 },
            resolutionType: 'ESCALATED',
          },
        });

        await log({
          category: AuditCategory.DISPUTE,
          action: AuditAction.ESCALATE_DISPUTE,
          actor: 'system',
          resourceId: String(dispute.id),
          metadata: {
            escrowId: String(dispute.escrowId),
            tenantId: dispute.tenantId,
            escalationCount: dispute.escalationCount + 1,
            reason: `No arbiter activity for ${thresholdMs / 3_600_000}h`,
          },
        });

        await notifyAdmin(dispute);

        totalEscalated++;
        logger.info({ message: 'dispute_escalated', disputeId: dispute.id, tenantId: tenant.id });
      } catch (err) {
        logger.error({ message: 'dispute_escalation_failed', disputeId: dispute.id, error: err.message });
      }
    }
  }

  logger.info({ message: 'dispute_escalation_job_complete', totalEscalated });
  return totalEscalated;
}

export default { runDisputeEscalationJob };
