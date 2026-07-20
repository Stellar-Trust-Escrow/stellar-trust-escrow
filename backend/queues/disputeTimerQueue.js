/**
 * Dispute Timer Queue
 *
 * Handles delayed jobs for dispute lifecycle transitions:
 *   - evidence-collection-expired: fired after 72h evidence window
 *   - appeal-window-expired: fired after 48h appeal window
 *
 * In production a real BullMQ queue backed by Redis is used.
 * Under NODE_ENV=test a lightweight in-memory implementation is used so
 * unit/integration tests run without a Redis server.
 */

import { Queue } from 'bullmq';
import { connection } from './index.js';

export const DISPUTE_TIMER_QUEUE = 'dispute-timers';

class InMemoryDisputeTimerQueue {
  constructor(name) {
    this.name = name;
    this.jobs = [];
    this._seq = 0;
  }

  async add(jobName, data, opts = {}) {
    const id = opts.jobId || `${this.name}-${++this._seq}`;
    const job = { id, name: jobName, data, opts };
    this.jobs.push(job);
    return job;
  }

  async getWaiting() {
    return [...this.jobs];
  }

  async getJob(id) {
    return this.jobs.find((job) => job.id === id) || null;
  }

  async close() {}

  __resetForTests() {
    this.jobs = [];
    this._seq = 0;
  }
}

const isTest = process.env.NODE_ENV === 'test';

export const disputeTimerQueue = isTest
  ? new InMemoryDisputeTimerQueue(DISPUTE_TIMER_QUEUE)
  : new Queue(DISPUTE_TIMER_QUEUE, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
      },
    });

/**
 * Schedule a job to fire when the evidence collection window expires.
 * @param {number} disputeId
 * @param {number} delayMs
 */
export async function scheduleEvidenceExpiry(disputeId, delayMs) {
  return disputeTimerQueue.add('evidence-collection-expired', { disputeId }, { delay: delayMs });
}

/**
 * Schedule a job to fire when the appeal window expires.
 * @param {number} disputeId
 * @param {number} delayMs
 */
export async function scheduleAppealExpiry(disputeId, delayMs) {
  return disputeTimerQueue.add('appeal-window-expired', { disputeId }, { delay: delayMs });
}

export function __resetForTests() {
  disputeTimerQueue.__resetForTests?.();
}

export default disputeTimerQueue;
