import { Queue } from 'bullmq';

class InMemoryQueue {
  constructor(name) {
    this.name = name;
    this.jobs = [];
  }

  async add(eventType, data) {
    const job = {
      id: `${this.name}-${this.jobs.length + 1}`,
      name: eventType,
      data,
    };
    this.jobs.push(job);
    return job;
  }

  async getWaiting() {
    return [...this.jobs];
  }

  async getActive() {
    return [];
  }

  async getFailed() {
    return [];
  }

  __resetForTests() {
    this.jobs = [];
  }
}

const redisConnection = process.env.REDIS_URL
  ? { url: process.env.REDIS_URL }
  : {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    };

const createQueue = (name) =>
  process.env.NODE_ENV === 'test'
    ? new InMemoryQueue(name)
    : new Queue(name, { connection: redisConnection });

export const emailQueue = createQueue('email');
export const webhookQueue = createQueue('webhook');
export const scheduledQueue = createQueue('scheduled');
