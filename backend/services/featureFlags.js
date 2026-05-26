import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { log, AuditCategory } from './auditService.js';

/**
 * Deterministic hash of userId + flagKey → integer 0–99.
 * Same user always gets the same bucket for a given flag.
 */
function hashBucket(userId, flagKey) {
  const hash = crypto.createHash('sha256').update(`${userId}:${flagKey}`).digest('hex');
  return parseInt(hash.slice(0, 8), 16) % 100;
}

/**
 * Evaluate whether a feature flag is active for a given user context.
 *
 * Rules (in order):
 *  1. Flag disabled globally → false
 *  2. User explicitly in targetUsers → true
 *  3. User's hash bucket < percentage → true
 *  4. Otherwise → false
 *
 * @param {string} flagKey
 * @param {{ id: string|number }} userContext
 * @returns {Promise<boolean>}
 */
export async function isFeatureEnabled(flagKey, userContext) {
  const flag = await prisma.featureFlag.findUnique({ where: { key: flagKey } });
  if (!flag) return false;
  if (!flag.isEnabled) {
    // Still allow explicitly targeted users even when globally disabled
    return flag.targetUsers.includes(String(userContext.id));
  }
  if (flag.targetUsers.includes(String(userContext.id))) return true;
  return hashBucket(String(userContext.id), flagKey) < flag.percentage;
}

/**
 * Return all flags (for admin listing).
 */
export async function listFlags() {
  return prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
}

/**
 * Create a new feature flag.
 */
export async function createFlag({ key, isEnabled = false, percentage = 0, targetUsers = [], description = '' }, adminId) {
  const flag = await prisma.featureFlag.create({
    data: { key, isEnabled, percentage, targetUsers, description },
  });
  await _auditFlagChange('FLAG_CREATED', flag.key, adminId, { isEnabled, percentage });
  return flag;
}

/**
 * Update an existing flag. Logs every change.
 */
export async function updateFlag(key, patch, adminId) {
  const flag = await prisma.featureFlag.update({
    where: { key },
    data: patch,
  });
  await _auditFlagChange('FLAG_UPDATED', key, adminId, patch);
  return flag;
}

/**
 * Delete a flag.
 */
export async function deleteFlag(key, adminId) {
  await prisma.featureFlag.delete({ where: { key } });
  await _auditFlagChange('FLAG_DELETED', key, adminId, {});
}

async function _auditFlagChange(action, flagKey, adminId, changes) {
  await log({
    category: AuditCategory.ADMIN,
    action,
    actor: String(adminId ?? 'admin'),
    resourceId: flagKey,
    metadata: changes,
  });
}
