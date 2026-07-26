/**
 * Escrow Export Queue
 *
 * Large escrow-history exports are expensive to generate, so they are handled
 * as background jobs instead of blocking the request/response cycle.
 *
 * - In production a real BullMQ queue (backed by Redis) is used.
 * - Under NODE_ENV=test the queue falls back to a lightweight in-memory
 *   implementation (mirroring queues/index.js) so unit/integration tests run
 *   without a Redis server. In that mode jobs are stored but not auto-processed;
 *   tests drive processing by calling the worker/service directly.
 */

import { Queue, Worker } from 'bullmq';
import { connection } from './index.js';

export const EXPORT_QUEUE_NAME = 'escrow-export';

class InMemoryExportQueue {
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

export const exportQueue = isTest
  ? new InMemoryExportQueue(EXPORT_QUEUE_NAME)
  : new Queue(EXPORT_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
      },
    });

/**
 * Enqueue an escrow export job.
 *
 * @param {string} jobId  — pre-generated job id (also used as the Redis status key)
 * @param {object} params — { format, dateFrom, dateTo, status, tenantId, requestedBy }
 * @returns {Promise<object>} the created job
 */
export async function enqueueExportJob(jobId, params) {
  return exportQueue.add('export', params, { jobId });
}

/**
 * Start the BullMQ worker that processes escrow export jobs.
 * Delegates the heavy lifting to exportService.processExportJob so the queue
 * wiring stays thin and the business logic remains unit-testable in isolation.
 *
 * @returns {import('bullmq').Worker}
 */
export function startExportWorker() {
  const worker = new Worker(
    EXPORT_QUEUE_NAME,
    async (job) => {
      const { default: exportService } = await import('../services/exportService.js');
      return exportService.processExportJob(job.id, job.data, {
        onProgress: (progress) => job.updateProgress(progress),
      });
    },
    { connection, concurrency: 2 },
  );
  return worker;
}

export function __resetForTests() {
  exportQueue.__resetForTests?.();
}

export default exportQueue;
