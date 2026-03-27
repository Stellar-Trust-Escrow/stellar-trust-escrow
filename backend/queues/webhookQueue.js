import { webhookQueue } from './index.js';

export async function sendWebhook(url, payload, headers = {}) {
  return webhookQueue.add('webhook', { url, payload, headers });
}

export default {
  sendWebhook,
};
