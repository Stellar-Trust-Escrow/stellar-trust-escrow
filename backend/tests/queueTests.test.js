/**
 * BullMQ Queue System Tests
 *
 * Tests for retry logic, dead letter queue handling, and queue monitoring.
 * These tests verify the reliability of the Stellar event processing system.
 *
 * @module queueTests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Worker, Queue } from 'bullmq';
import { 
  stellarEventsQueue, 
  deadLetterQueue, 
  queueMetrics,
  connection 
} from '../lib/queueConfig.js';
import { createEventWorker, createDeadLetterWorker } from '../services/eventWorker.js';

describe('BullMQ Queue System', () => {
  let eventWorker;
  let deadLetterWorker;
  let testQueue;

  beforeEach(async () => {
    // Reset metrics
    queueMetrics.reset();
    
    // Clean up queues
    await stellarEventsQueue.clean(0, 0, 'completed');
    await stellarEventsQueue.clean(0, 0, 'failed');
    await deadLetterQueue.clean(0, 0, 'completed');
    await deadLetterQueue.clean(0, 0, 'failed');
    
    // Create test queue for isolation
    testQueue = new Queue('test-stellar-events', { connection });
  });

  afterEach(async () => {
    // Clean up workers
    if (eventWorker) {
      await eventWorker.close();
    }
    if (deadLetterWorker) {
      await deadLetterWorker.close();
    }
    
    // Clean up test queue
    if (testQueue) {
      await testQueue.close();
    }
  });

  describe('Queue Configuration', () => {
    it('should create queues with correct configuration', async () => {
      expect(stellarEventsQueue).toBeDefined();
      expect(deadLetterQueue).toBeDefined();
      
      const mainQueueCounts = await stellarEventsQueue.getJobCounts();
      const deadLetterCounts = await deadLetterQueue.getJobCounts();
      
      expect(typeof mainQueueCounts).toBe('object');
      expect(typeof deadLetterCounts).toBe('object');
    });

    it('should maintain Redis connection', async () => {
      const redisInfo = await connection.info();
      expect(redisInfo).toContain('redis_version');
    });
  });

  describe('Event Processing Worker', () => {
    beforeEach(() => {
      eventWorker = createEventWorker();
    });

    it('should process successful events', async () => {
      const eventData = {
        event: {
          topic: ['6573635f637274'], // EscrowCreated
          data: {},
        },
        ledger: 12345,
      };

      const job = await stellarEventsQueue.add('process-stellar-event', eventData);
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const processedJob = await stellarEventsQueue.getJob(job.id);
      expect(processedJob.finishedOn).toBeDefined();
      
      // Check metrics
      expect(queueMetrics.totalJobs).toBe(1);
      expect(queueMetrics.completedJobs).toBe(1);
      expect(queueMetrics.failedJobs).toBe(0);
    });

    it('should retry failed events with exponential backoff', async () => {
      const eventData = {
        event: null, // Invalid data to trigger failure
        ledger: 12345,
      };

      const job = await stellarEventsQueue.add('process-stellar-event', eventData, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 100,
        },
      });

      // Wait for retries
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const processedJob = await stellarEventsQueue.getJob(job.id);
      expect(processedJob.attemptsMade).toBe(3);
      expect(processedJob.failedReason).toBeDefined();
      
      // Check metrics
      expect(queueMetrics.totalJobs).toBe(1);
      expect(queueMetrics.failedJobs).toBe(1);
    });

    it('should move permanently failed jobs to dead letter queue', async () => {
      const eventData = {
        event: null, // Invalid data to trigger failure
        ledger: 12345,
      };

      const job = await stellarEventsQueue.add('process-stellar-event', eventData, {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 50,
        },
      });

      // Wait for processing and dead letter queue
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Check dead letter queue
      const deadLetterCounts = await deadLetterQueue.getJobCounts();
      expect(deadLetterCounts.waiting).toBe(1);
      
      // Check metrics
      expect(queueMetrics.deadLetterCount).toBe(1);
    });
  });

  describe('Dead Letter Queue Worker', () => {
    beforeEach(() => {
      deadLetterWorker = createDeadLetterWorker();
    });

    it('should process dead letter events', async () => {
      const deadLetterData = {
        originalJob: {
          data: { event: null, ledger: 12345 }
        },
        error: {
          message: 'Test error',
          stack: 'Test stack',
        },
        attemptsMade: 5,
      };

      const job = await deadLetterQueue.add('dead-letter-event', deadLetterData);
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const processedJob = await deadLetterQueue.getJob(job.id);
      expect(processedJob.finishedOn).toBeDefined();
    });
  });

  describe('Queue Metrics', () => {
    it('should track metrics correctly', () => {
      queueMetrics.totalJobs = 10;
      queueMetrics.completedJobs = 8;
      queueMetrics.failedJobs = 2;
      
      expect(queueMetrics.getFailureRate()).toBe(20);
      expect(queueMetrics.getSuccessRate()).toBe(80);
    });

    it('should handle zero division', () => {
      expect(queueMetrics.getFailureRate()).toBe(0);
      expect(queueMetrics.getSuccessRate()).toBe(0);
    });

    it('should reset metrics', () => {
      queueMetrics.totalJobs = 10;
      queueMetrics.reset();
      
      expect(queueMetrics.totalJobs).toBe(0);
      expect(queueMetrics.completedJobs).toBe(0);
      expect(queueMetrics.failedJobs).toBe(0);
    });
  });

  describe('Queue Dashboard API', () => {
    it('should return queue statistics', async () => {
      // Add a test job
      await stellarEventsQueue.add('test-job', { test: true });
      
      const response = await fetch('http://localhost:4000/admin/queues/stats');
      const stats = await response.json();
      
      expect(stats).toHaveProperty('metrics');
      expect(stats).toHaveProperty('mainQueue');
      expect(stats).toHaveProperty('deadLetterQueue');
      expect(stats).toHaveProperty('redis');
      expect(stats).toHaveProperty('alerts');
    });

    it('should return job list', async () => {
      // Add test jobs
      await stellarEventsQueue.add('test-job-1', { test: true });
      await stellarEventsQueue.add('test-job-2', { test: true });
      
      const response = await fetch('http://localhost:4000/admin/queues/jobs?state=waiting&limit=10');
      const data = await response.json();
      
      expect(data).toHaveProperty('jobs');
      expect(data).toHaveProperty('pagination');
      expect(Array.isArray(data.jobs)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis connection failures gracefully', async () => {
      // Simulate Redis connection failure
      await connection.quit();
      
      // Try to add job - should handle gracefully
      try {
        await stellarEventsQueue.add('test-job', { test: true });
      } catch (error) {
        expect(error.message).toContain('Redis');
      }
      
      // Reconnect for other tests
      await connection.connect();
    });

    it('should handle malformed job data', async () => {
      const malformedData = {
        event: 'invalid-data-type',
        ledger: 'not-a-number',
      };

      const job = await stellarEventsQueue.add('process-stellar-event', malformedData);
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const processedJob = await stellarEventsQueue.getJob(job.id);
      expect(processedJob.failedReason).toBeDefined();
    });
  });

  describe('Performance Tests', () => {
    it('should handle high volume of events', async () => {
      const eventCount = 100;
      const jobs = [];
      
      // Add multiple jobs
      for (let i = 0; i < eventCount; i++) {
        const eventData = {
          event: {
            topic: ['6573635f637274'],
            data: { id: i },
          },
          ledger: 12345 + i,
        };
        
        jobs.push(stellarEventsQueue.add('process-stellar-event', eventData));
      }
      
      // Wait for all jobs to be added
      await Promise.all(jobs);
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const counts = await stellarEventsQueue.getJobCounts();
      expect(counts.completed).toBe(eventCount);
    });

    it('should maintain processing under load', async () => {
      const startTime = Date.now();
      const eventCount = 50;
      
      // Add jobs with small delays
      for (let i = 0; i < eventCount; i++) {
        const eventData = {
          event: {
            topic: ['6573635f637274'],
            data: { id: i },
          },
          ledger: 12345 + i,
        };
        
        await stellarEventsQueue.add('process-stellar-event', eventData);
        
        // Small delay to simulate real events
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const processingTime = Date.now() - startTime;
      const counts = await stellarEventsQueue.getJobCounts();
      
      expect(counts.completed).toBe(eventCount);
      expect(processingTime).toBeLessThan(10000); // Should complete within 10 seconds
    });
  });
});
