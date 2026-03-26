// Sentry must be initialised before any other imports so it can
// instrument all subsequent modules (HTTP, DB, etc.)
import './lib/sentry.js';
import * as Sentry from '@sentry/node';

import 'dotenv/config';
import { initSecrets } from './lib/secrets.js';
import http from 'http';
import compressionMiddleware from './middleware/compression.js';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import docsRouter from './docs/index.js';
import disputeRoutes from './api/routes/disputeRoutes.js';
import searchRoutes from './api/routes/searchRoutes.js';
import escrowRoutes from './api/routes/escrowRoutes.js';
import eventRoutes from './api/routes/eventRoutes.js';
import kycRoutes from './api/routes/kycRoutes.js';
import adminRoutes from './api/routes/adminRoutes.js';
import notificationRoutes from './api/routes/notificationRoutes.js';
import paymentRoutes from './api/routes/paymentRoutes.js';
import relayerRoutes from './api/routes/relayerRoutes.js';
import reputationRoutes from './api/routes/reputationRoutes.js';
import userRoutes from './api/routes/userRoutes.js';
import auditRoutes from './api/routes/auditRoutes.js';
import authRoutes from './api/routes/authRoutes.js';
import authMiddleware from './api/middleware/auth.js';
import auditMiddleware from './api/middleware/audit.js';
import _apiV1Routes from './api/v1/index.js';
import { deprecatedRoute as _deprecatedRoute } from './api/middleware/version.js';
import { createWebSocketServer, pool } from './api/websocket/handlers.js';
import cache from './lib/cache.js';
import { attachPrismaMetrics } from './lib/prismaMetrics.js';
import prisma, { startConnectionMonitoring } from './lib/prisma.js';
import { errorsTotal } from './lib/metrics.js';
import { apiRateLimit, leaderboardRateLimit } from './middleware/rateLimit.js';
import metricsMiddleware from './middleware/metricsMiddleware.js';
import responseTime from './middleware/responseTime.js';
import emailService from './services/emailService.js';
import { startIndexer } from './services/eventIndexer.js';
import { setupSwagger } from './api/docs/swagger.js';

// Attach Prisma query instrumentation and monitoring
attachPrismaMetrics(prisma);
startConnectionMonitoring(prisma);

const PORT = process.env.PORT || 4000;
const app = express();

// ── Sentry request handler — must be first middleware ─────────────────────────
// Attaches trace context and request data to every event captured downstream.
app.use(Sentry.expressRequestHandler());

app.use(helmet());
app.use(compressionMiddleware);
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
app.use('/uploads', express.static('uploads'));
app.use(auditMiddleware);

// ── Sentry tracing handler — after body parsers, before routes ────────────────
app.use(Sentry.expressTracingHandler());

app.use('/api/', apiRateLimit);
app.use('/api/reputation/leaderboard', leaderboardRateLimit);

app.get('/health', async (_req, res) => {
  let dbStatus = 'ok';
  let dbLatencyMs = null;
  let dbPoolInfo = null;

  try {
    const t0 = Date.now();
    // Test basic connectivity
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - t0;

    // Get basic pool info if available
    try {
      // This is a simplified check - in production with direct pg access,
      // you could get detailed pool stats
      const poolCheck = await prisma.$queryRaw`
        SELECT
          count(*) as connection_count,
          now() as current_time
        FROM pg_stat_activity
        WHERE datname = current_database()
      `;
      dbPoolInfo = {
        activeConnections: parseInt(poolCheck[0].connection_count),
        timestamp: poolCheck[0].current_time,
      };
    } catch (poolError) {
      // Pool info not available, that's ok
      console.warn('[HEALTH] Could not get pool info:', poolError.message);
    }
  } catch (error) {
    dbStatus = 'error';
    console.error('[HEALTH] Database check failed:', error.message);
  }

  const status = dbStatus === 'ok' ? 'ok' : 'degraded';
  res.status(dbStatus === 'ok' ? 200 : 503).json({
    status,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    cache: cache.analytics(),
    websocket: pool.getMetrics(),
    db: {
      status: dbStatus,
      latencyMs: dbLatencyMs,
      pool: dbPoolInfo,
    },
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/escrows', authMiddleware, escrowRoutes);

// ── API Documentation ─────────────────────────────────────────────────────────
setupSwagger(app);
app.use('/api/users', authMiddleware, userRoutes);
app.use('/api/reputation', reputationRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/relayer', relayerRoutes);
app.use('/api/audit', auditRoutes);
app.use('/docs', docsRouter);
app.use('/api/admin', adminRoutes);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Sentry error handler — must be before the generic error handler ───────────
// Captures unhandled Express errors and attaches request context.
app.use(
  Sentry.expressErrorHandler({
    shouldHandleError(err) {
      // Report all 5xx errors; skip expected 4xx client errors
      return !err.statusCode || err.statusCode >= 500;
    },
  }),
);

// ── Generic error handler ─────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  const statusCode = err.statusCode || 500;

  // Attach Sentry event ID to response so support can correlate reports
  const sentryId = res.sentry;
  const body = { error: err.message || 'Internal server error' };
  if (sentryId) body.errorId = sentryId;

  if (statusCode >= 500) {
    console.error(err.stack);
  }

  errorsTotal.inc({ type: err.name || 'Error', route: _req?.path || 'unknown' });
  res.status(statusCode).json(body);
});

const server = http.createServer(app);
createWebSocketServer(server);

server.listen(PORT, async () => {
  // Load secrets first — merges vault/env secrets into process.env
  await initSecrets();
  console.log(`[Secrets] Backend: ${process.env.SECRETS_BACKEND || 'env'}`);
  console.log(`API running on port ${PORT}`);
  console.log(`Network: ${process.env.STELLAR_NETWORK}`);
  await emailService.start();
  console.log('[EmailService] Queue processor started');
  console.log('[WebSocket] Server attached');
  startIndexer().catch((err) => {
    console.error('[Indexer] Failed to start:', err.message);
    Sentry.captureException(err, { tags: { component: 'indexer' } });
  });
});

export default app;
