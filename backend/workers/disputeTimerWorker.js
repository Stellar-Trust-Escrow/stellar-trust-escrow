/**
 * Dispute Timer Worker
 *
 * Processes BullMQ jobs from the dispute-timers queue to drive lifecycle transitions:
 *   - evidence-collection-expired: moves dispute to arbiter_review
 *   - appeal-window-expired: finalizes the dispute
 */

import { Worker } from 'bullmq';
import { connection } from '../queues/index.js';
import { finalizeDispute } from '../services/disputeResolution.js';
import { createModuleLogger } from '../config/logger.js';
import prisma from '../lib/prisma.js';

const log = createModuleLogger('disputeTimerWorker');

/**
 * Start the dispute timer worker.
 * Returns a no-op stub under NODE_ENV=test.
 *
 * @returns {{ close: () => Promise<void> }}
 */
export function startDisputeTimerWorker() {
  if (process.env.NODE_ENV === 'test') {
    return { close: async () => {} };
  }

  const worker = new Worker(
    'dispute-timers',
    async (job) => {
      const { disputeId } = job.data;

      if (job.name === 'evidence-collection-expired') {
        log.info({ disputeId }, 'Evidence window expired — transitioning to arbiter_review');
        await prisma.dispute.updateMany({
          where: { id: disputeId, status: 'evidence_collection' },
          data: { status: 'arbiter_review' },
        });
      } else if (job.name === 'appeal-window-expired') {
        log.info({ disputeId }, 'Appeal window expired — finalizing dispute');
        await finalizeDispute({ disputeId });
      } else {
        log.warn({ disputeId, jobName: job.name }, 'Unknown dispute timer job name');
      }
    },
    { connection },
  );

  worker.on('failed', (job, err) => {
    log.error({ jobId: job?.id, jobName: job?.name, err: err.message }, 'Dispute timer job failed');
  });

  return worker;
}
