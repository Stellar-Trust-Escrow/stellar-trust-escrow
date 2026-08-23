import { createModuleLogger } from '../config/logger.js';

const log = createModuleLogger('service.payment');

async function createCheckoutSession({ address, amountUsd, escrowId }) {
  log.info({ message: 'payment.createCheckoutSession', address, amountUsd, escrowId });
  throw new Error('Payment provider not configured');
}

async function getBySessionId(sessionId) {
  log.info({ message: 'payment.getBySessionId', sessionId });
  return null;
}

async function getByAddress(address) {
  log.info({ message: 'payment.getByAddress', address });
  return [];
}

async function getById(paymentId) {
  log.info({ message: 'payment.getById', paymentId });
  return null;
}

async function refund(paymentId) {
  log.info({ message: 'payment.refund', paymentId });
  throw new Error('Payment provider not configured');
}

async function handleWebhook(rawBody, signature) {
  log.info({ message: 'payment.handleWebhook' });
  throw new Error('Payment provider not configured');
}

export default { createCheckoutSession, getBySessionId, getByAddress, getById, refund, handleWebhook };
