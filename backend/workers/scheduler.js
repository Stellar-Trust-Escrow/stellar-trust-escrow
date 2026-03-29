import cron from 'node-cron';
import { scheduledQueue } from '../queues/index.js';

// Daily cleanup at 2AM UTC
cron.schedule(
  '0 2 * * *',
  async () => {
    console.log('[Scheduler] Running daily maintenance');
    await scheduledQueue.add('cleanup', {
      type: 'failed-jobs',
      age: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  },
  {
    timezone: 'UTC',
  },
);

// Hourly reputation recalc if needed
cron.schedule('0 * * * *', async () => {
  console.log('[Scheduler] Running hourly reputation check');
  await scheduledQueue.add('reputation-check', {});
});

console.log('[Scheduler] Started - queues ready for cron jobs');
