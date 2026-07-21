import { Queue, Worker } from 'bullmq';
import gasService from '../services/gasService.js';

const connection = process.env.REDIS_URL
  ? { url: process.env.REDIS_URL }
  : {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    };

export const gasPollerQueue = process.env.NODE_ENV === 'test'
  ? { add: async () => ({ id: 'test' }), name: 'gas:poll-fee-stats' }
  : new Queue('gas:poll-fee-stats', { connection });

if (process.env.NODE_ENV !== 'test') {
  new Worker(
    'gas:poll-fee-stats',
    async () => {
      await gasService.pollFeeStats();
    },
    { connection },
  );
}

export async function scheduleGasPolling() {
  if (process.env.NODE_ENV === 'test') return null;

  await gasPollerQueue.add('gas:poll-fee-stats', {}, { repeat: { every: 60_000 } });
  return gasPollerQueue;
}
