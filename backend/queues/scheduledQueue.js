import { scheduledQueue } from './index.js';

export async function scheduleCleanup() {
  return scheduledQueue.add('cleanup', { type: 'failed-jobs' });
}

export async function scheduleReputationCheck() {
  return scheduledQueue.add('reputation-check', {});
}

export default {
  scheduleCleanup,
  scheduleReputationCheck,
};
