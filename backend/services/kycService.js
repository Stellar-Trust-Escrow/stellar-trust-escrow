import { createModuleLogger } from '../config/logger.js';
const log = createModuleLogger('service.kyc');

async function getStatus(address) {
  log.info({ message: 'kyc.getStatus', address });
  return { status: 'not_configured', address };
}

async function submitVerification(address, data) {
  log.info({ message: 'kyc.submitVerification', address });
  throw new Error('KYC provider not configured');
}

async function getVerifications(address) {
  log.info({ message: 'kyc.getVerifications', address });
  return [];
}

export default { getStatus, submitVerification, getVerifications };
