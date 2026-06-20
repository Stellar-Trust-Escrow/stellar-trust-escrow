import cron from 'node-cron';
import prisma from '../lib/prisma.js';
import { scheduledQueue } from '../queues/index.js';
import { archiveCompletedEscrows } from '../services/escrowArchiveService.js';
import { syncFromPrisma } from '../services/reputationSearchService.js';
import { runGarbageCollector } from '../services/ipfsGarbageCollector.js';

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

// Daily archive sweep at 1AM UTC
cron.schedule(
  '0 1 * * *',
  async () => {
    console.log('[Scheduler] Archiving completed escrows older than one year');
    await archiveCompletedEscrows(prisma).catch((err) =>
      console.warn('[EscrowArchive] Daily archive sweep failed:', err.message),
    );
  },
  { timezone: 'UTC' },
);

// Daily ES reputation sync at 3AM UTC
cron.schedule(
  '0 3 * * *',
  async () => {
    console.log('[Scheduler] Running daily reputation ES sync');
    await syncFromPrisma().catch((err) =>
      console.warn('[ReputationSearch] Daily sync failed:', err.message),
    );
  },
  { timezone: 'UTC' },
);

// Daily IPFS garbage collection at 4AM UTC
cron.schedule(
  '0 4 * * *',
  async () => {
    console.log('[Scheduler] Running daily IPFS garbage collector');
    try {
      await runGarbageCollector({ dryRun: false });
    } catch (err) {
      console.warn('[IPFSGC] Daily run failed:', err?.message || err);
    }
  },
  { timezone: 'UTC' },
);

console.log('[Scheduler] Started - queues ready for cron jobs');
