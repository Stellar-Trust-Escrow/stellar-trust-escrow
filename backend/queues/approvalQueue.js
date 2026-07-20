/**
 * Approval Expiry Queue
 *
 * Schedules delayed jobs to mark approval requests as expired when their
 * deadline passes.
 *
 * - In production a real BullMQ queue (backed by Redis) is used.
 * - Under NODE_ENV=test the queue falls back to a lightweight in-memory
 *   implementation so tests run without a Redis server.
 */

import { Queue } from 'bullmq';
import { connection } from './index.js';

export const APPROVAL_QUEUE_NAME = 'approval-expiry';

class InMemoryApprovalQueue {
  constructor(name) {
    this.name = name;
    this.jobs = [];
    this._seq = 0;
  }

  async add(name, data, opts = {}) {
    const id = opts.jobId || `${this.name}-${++this._seq}`;
    const job = { id, name, data, opts };
    this.jobs.push(job);
    return job;
  }

  async getWaiting() {
    return [...this.jobs];
  }

  async close() {}

  __resetForTests() {
    this.jobs = [];
    this._seq = 0;
  }
}

export const approvalQueue =
  process.env.NODE_ENV === 'test'
    ? new InMemoryApprovalQueue(APPROVAL_QUEUE_NAME)
    : new Queue(APPROVAL_QUEUE_NAME, { connection });

/**
 * Schedule a delayed job to expire the given request when its deadline passes.
 *
 * @param {string} requestId
 * @param {Date|string} deadlineAt
 */
export async function scheduleExpiry(requestId, deadlineAt) {
  const delay = Math.max(0, new Date(deadlineAt).getTime() - Date.now());
  return approvalQueue.add(
    'approval-expired',
    { requestId },
    { delay, jobId: `expiry-${requestId}` },
  );
}

export function __resetForTests() {
  approvalQueue.__resetForTests?.();
}

export default approvalQueue;
