/* eslint-disable no-undef */
import 'dotenv/config';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import disputeRoutes from './api/routes/disputeRoutes.js';
import escrowRoutes from './api/routes/escrowRoutes.js';
import eventRoutes from './api/routes/eventRoutes.js';
import kycRoutes from './api/routes/kycRoutes.js';
import notificationRoutes from './api/routes/notificationRoutes.js';
import paymentRoutes from './api/routes/paymentRoutes.js';
import reputationRoutes from './api/routes/reputationRoutes.js';
import userRoutes from './api/routes/userRoutes.js';
import cache from './lib/cache.js';
import { attachPrismaMetrics } from './lib/prismaMetrics.js';
import prisma from './lib/prisma.js';
import { errorsTotal } from './lib/metrics.js';
import metricsMiddleware from './middleware/metricsMiddleware.js';
import responseTime from './middleware/responseTime.js';
import emailService from './services/emailService.js';
import { startIndexer } from './services/eventIndexer.js';

// Attach Prisma query instrumentation
attachPrismaMetrics(prisma);

const app = express();
const PORT = process.env.PORT || 4000;

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

const defaultLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: 'Too many requests from this IP, please try again later.',
});

const leaderboardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many leaderboard requests, please slow down.',
});

app.use('/api/', defaultLimiter);
app.use('/api/reputation/leaderboard', leaderboardLimiter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), cache: cache.analytics() });
});

app.use('/api/escrows', escrowRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reputation', reputationRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/payments', paymentRoutes);

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

app.listen(PORT, async () => {
  console.log(`API running on port ${PORT}`);
  console.log(`Network: ${process.env.STELLAR_NETWORK}`);
  await emailService.start();
  console.log('[EmailService] Queue processor started');
  startIndexer().catch((err) => console.error('[Indexer] Failed to start:', err.message));
});

export default app;
