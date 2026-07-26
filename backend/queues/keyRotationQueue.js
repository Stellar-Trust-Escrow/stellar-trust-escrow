import { Queue, Worker } from 'bullmq';
import { getRedisConfig } from '../lib/queueConfig.js';
import keyRotationService from '../services/keyRotationService.js';
import { getLogger } from '../config/logger.js';
import * as Sentry from '@sentry/node';

const log = getLogger();

export const keyRotationQueue = new Queue('keyRotation', {
  connection: getRedisConfig(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 10,
    removeOnFail: 100,
  },
});

export function createKeyRotationWorker() {
  const worker = new Worker(
    'keyRotation',
    async (job) => {
      try {
        switch (job.name) {
          case 'key:rotate':
            log.info('Executing scheduled key:rotate job...');
            await keyRotationService.rotateKey();
            log.info('Scheduled key:rotate job completed.');
            break;
            
          case 'key:prune':
            log.info('Executing scheduled key:prune job...');
            await keyRotationService.pruneExpiredKeys();
            log.info('Scheduled key:prune job completed.');
            break;
            
          default:
            throw new Error(`Unknown job type: ${job.name}`);
        }
      } catch (error) {
        log.error({ err: error, jobId: job.id, jobName: job.name }, 'Key rotation job failed');
        throw error;
      }
    },
    {
      connection: getRedisConfig(),
      concurrency: 1, // Keys should be rotated/pruned serially
    }
  );

  worker.on('failed', (job, err) => {
    Sentry.captureException(err, {
      tags: { component: 'keyRotationWorker' },
      extra: { jobId: job?.id, jobName: job?.name },
    });
  });

  return worker;
}

export async function scheduleKeyRotationJobs() {
  const KEY_ROTATION_INTERVAL_MS = parseInt(process.env.KEY_ROTATION_INTERVAL_MS, 10) || 7 * 24 * 60 * 60 * 1000;
  const PRUNE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

  // Rotate every KEY_ROTATION_INTERVAL_MS
  await keyRotationQueue.add('key:rotate', {}, {
    repeat: { every: KEY_ROTATION_INTERVAL_MS },
    jobId: 'key:rotate-job',
  });

  // Prune every hour
  await keyRotationQueue.add('key:prune', {}, {
    repeat: { every: PRUNE_INTERVAL_MS },
    jobId: 'key:prune-job',
  });
  
  log.info(`Scheduled key:rotate (every ${KEY_ROTATION_INTERVAL_MS}ms) and key:prune (every ${PRUNE_INTERVAL_MS}ms).`);
}
