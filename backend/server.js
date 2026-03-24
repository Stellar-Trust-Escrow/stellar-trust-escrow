/* eslint-disable no-undef */
import 'dotenv/config';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import adminRoutes from './api/routes/adminRoutes.js';
import auditMiddleware from './api/middleware/audit.js';
import disputeRoutes from './api/routes/disputeRoutes.js';
import escrowRoutes from './api/routes/escrowRoutes.js';
import eventRoutes from './api/routes/eventRoutes.js';
import kycRoutes from './api/routes/kycRoutes.js';
import metricsRoutes from './api/routes/metricsRoutes.js';
import notificationRoutes from './api/routes/notificationRoutes.js';
import paymentRoutes from './api/routes/paymentRoutes.js';
import reputationRoutes from './api/routes/reputationRoutes.js';
import userRoutes from './api/routes/userRoutes.js';
import auditRoutes from './api/routes/auditRoutes.js';
import cache from './lib/cache.js';
import { attachPrismaMetrics } from './lib/prismaMetrics.js';
import prisma from './lib/prisma.js';
import { errorsTotal } from './lib/metrics.js';
import { apiRateLimit, leaderboardRateLimit } from './middleware/rateLimit.js';
import metricsMiddleware from './middleware/metricsMiddleware.js';
import responseTime from './middleware/responseTime.js';
import emailService from './services/emailService.js';
import { startIndexer } from './services/eventIndexer.js';

// Attach Prisma query instrumentation
attachPrismaMetrics(prisma);

const PORT = process.env.PORT || 4000;

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(compression());
  app.use(metricsMiddleware);
  app.use(responseTime);
  app.use(
    cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || 'http://localhost:3000',
      credentials: true,
    }),
  );
  app.use(morgan('combined'));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(auditMiddleware);

  app.use('/api/reputation/leaderboard', leaderboardRateLimit);
  app.use('/api', apiRateLimit);

  app.get('/health', async (_req, res) => {
    let dbStatus = 'ok';
    let dbLatencyMs = null;

    try {
      const t0 = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - t0;
    } catch {
      dbStatus = 'error';
    }

    const status = dbStatus === 'ok' ? 'ok' : 'degraded';
    res.status(dbStatus === 'ok' ? 200 : 503).json({
      status,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      cache: cache.analytics(),
      db: { status: dbStatus, latencyMs: dbLatencyMs },
    });
  });

  app.use('/api/escrows', escrowRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/reputation', reputationRoutes);
  app.use('/api/disputes', disputeRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/events', eventRoutes);
  app.use('/api/kyc', kycRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/metrics', metricsRoutes);

  app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err.stack);
    errorsTotal.inc({ type: err.name || 'Error', route: _req?.path || 'unknown' });
    res.status(err.statusCode || 500).json({
      error: err.message || 'Internal server error',
    });
  });

  return app;
}

const app = createApp();

export async function startServer() {
  return app.listen(PORT, async () => {
    console.log(`API running on port ${PORT}`);
    console.log(`Network: ${process.env.STELLAR_NETWORK}`);
    await emailService.start();
    console.log('[EmailService] Queue processor started');
    startIndexer().catch((err) => console.error('[Indexer] Failed to start:', err.message));
  });
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;
