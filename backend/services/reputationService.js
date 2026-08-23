import { createModuleLogger } from '../config/logger.js';
const log = createModuleLogger('service.reputation');

export async function recalculateFromEventHistory(tenantId) {
  log.info({ message: 'reputation.recalculateFromEventHistory', tenantId });
  return { recalculated: 0 };
}

export async function getReputation(walletAddress) {
  log.info({ message: 'reputation.getReputation', walletAddress });
  return { walletAddress, score: 0, tier: 'Unrated' };
}

export async function updateReputation(walletAddress, delta) {
  log.info({ message: 'reputation.updateReputation', walletAddress, delta });
  return { walletAddress, updated: true };
}

export default { recalculateFromEventHistory, getReputation, updateReputation };
