import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('auditService');

export const AuditCategory = {
  ADMIN: 'ADMIN',
};

export const AuditAction = {
  // Existing from featureFlags etc
  FLAG_CREATED: 'FLAG_CREATED',
  FLAG_UPDATED: 'FLAG_UPDATED',
  FLAG_DELETED: 'FLAG_DELETED',
  // generic
  API_ACTION: 'API_ACTION',
};

/**
 * Computes the SHA-256 hash of an entry.
 */
function computeHash(entry, prevChainHash) {
  const content = JSON.stringify({
    action: entry.action,
    targetAddress: entry.targetAddress,
    reason: entry.reason,
    performedBy: entry.performedBy,
    performedAt: entry.performedAt.toISOString(),
  });
  
  const hash = crypto.createHash('sha256');
  if (prevChainHash) {
    hash.update(prevChainHash + content);
  } else {
    hash.update(content);
  }
  return hash.digest('hex');
}

/**
 * Append an entry to the audit log.
 */
export async function appendAuditEntry({ action, targetAddress, reason = '', performedBy = 'system', escrowId, metadata, tenantId }) {
  try {
    // If escrowId is provided, we can either append it to reason or targetAddress.
    // Assuming targetAddress is the best fit if not already set.
    const finalTarget = targetAddress || escrowId || 'system';
    const finalReason = metadata ? `${reason} ${JSON.stringify(metadata)}`.trim() : reason;
    const performedAt = new Date();

    const entryToHash = {
      action,
      targetAddress: finalTarget,
      reason: finalReason,
      performedBy,
      performedAt
    };

    // Use a transaction to ensure we lock the last entry for sequential chaining
    return await prisma.$transaction(async (tx) => {
      // Get the latest entry
      const prevEntry = await tx.adminAuditLog.findFirst({
        orderBy: { id: 'desc' }
      });

      const prevChainHash = prevEntry ? prevEntry.chainHash : null;
      const prevEntryId = prevEntry ? String(prevEntry.id) : null;
      
      const chainHash = computeHash(entryToHash, prevChainHash);

      // Default tenant to "default" if not provided, just in case, but usually handled by extension
      // We will let prisma throw if it's missing and required. Let's just pass what we can.
      const data = {
        action,
        targetAddress: finalTarget,
        reason: finalReason,
        performedBy,
        performedAt,
        chainHash,
        prevEntryId,
      };
      if (tenantId) {
        data.tenantId = tenantId;
      } else {
        // Find default tenant or just assume it is injected? 
        // We'll set a default tenantId if it doesn't fail. Usually it's injected.
      }

      const auditLog = await tx.adminAuditLog.create({ data });
      return auditLog;
    });
  } catch (err) {
    logger.error('Failed to append audit entry:', err);
    // Fire-and-forget: we do not throw.
    return null;
  }
}

/**
 * Verify a single entry
 */
export async function verifyEntry(entryId) {
  const entry = await prisma.adminAuditLog.findUnique({
    where: { id: Number(entryId) }
  });
  if (!entry) return { valid: false, error: 'Entry not found' };

  let prevChainHash = null;
  if (entry.prevEntryId) {
    const prevEntry = await prisma.adminAuditLog.findUnique({
      where: { id: Number(entry.prevEntryId) }
    });
    if (prevEntry) {
      prevChainHash = prevEntry.chainHash;
    }
  }

  const expectedHash = computeHash({
    action: entry.action,
    targetAddress: entry.targetAddress,
    reason: entry.reason,
    performedBy: entry.performedBy,
    performedAt: entry.performedAt
  }, prevChainHash);

  const valid = expectedHash === entry.chainHash;
  return { valid, expected_hash: expectedHash, stored_hash: entry.chainHash };
}

/**
 * Verify the entire chain
 */
export async function verifyChain(fromEntryId, toEntryId) {
  const entries = await prisma.adminAuditLog.findMany({
    where: {
      id: {
        gte: Number(fromEntryId),
        lte: Number(toEntryId)
      }
    },
    orderBy: { id: 'asc' }
  });

  if (entries.length === 0) return { valid: true, total_checked: 0 };

  let total_checked = 0;
  for (const entry of entries) {
    let prevChainHash = null;
    if (entry.prevEntryId) {
      // If the prevEntry is not in the array, fetch it
      const prevEntry = entries.find(e => String(e.id) === entry.prevEntryId) || 
                        await prisma.adminAuditLog.findUnique({ where: { id: Number(entry.prevEntryId) } });
      if (prevEntry) {
        prevChainHash = prevEntry.chainHash;
      }
    }

    const expectedHash = computeHash({
      action: entry.action,
      targetAddress: entry.targetAddress,
      reason: entry.reason,
      performedBy: entry.performedBy,
      performedAt: entry.performedAt
    }, prevChainHash);

    if (expectedHash !== entry.chainHash) {
      return { valid: false, first_broken_at: String(entry.id), total_checked };
    }
    total_checked++;
  }

  return { valid: true, total_checked };
}

/**
 * Export audit entries for an escrow as a tamper-evident JSON bundle
 */
export async function exportAuditBundle(escrowId) {
  const entries = await prisma.adminAuditLog.findMany({
    where: { targetAddress: escrowId },
    orderBy: { id: 'asc' }
  });

  const allChainHashes = entries.map(e => e.chainHash).join('');
  const root_hash = crypto.createHash('sha256').update(allChainHashes).digest('hex');

  return { entries, root_hash };
}

// For compatibility with old code
export async function log(entry) {
  return appendAuditEntry({
    action: entry.action,
    targetAddress: entry.resourceId || 'system',
    reason: 'Legacy audit log',
    performedBy: entry.actor,
    metadata: entry.metadata,
  });
}
