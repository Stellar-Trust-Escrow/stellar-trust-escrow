// Sentry must be initialised before any other imports so it can
// instrument all subsequent modules (HTTP, DB, etc.)
import './lib/sentry.js';
import * as Sentry from '@sentry/node';

import 'dotenv/config';
import { randomUUID } from 'crypto';
import { initSecrets } from './lib/secrets.js';
import http from 'http';
import compressionMiddleware from './middleware/compression.js';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { logger, requestLogger } from './lib/logger.js';

import cookieParser from 'cookie-parser';
import {
  sanitizeInputs,
  csrfProtection,
  generateCsrfToken,
  REQUEST_SIZE_LIMIT,
} from './middleware/validation.js';

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
import complianceRoutes from './api/routes/complianceRoutes.js';
import incidentRoutes from './api/routes/incidentRoutes.js';
import batchRoutes from './api/routes/batchRoutes.js';
import tenantMiddleware from './api/middleware/tenant.js';
import auditMiddleware from './api/middleware/audit.js';
import { deprecateVersion } from './api/middleware/deprecation.js';
import { createWebSocketServer, pool } from './api/websocket/handlers.js';
import cache from './lib/cache.js';
import { attachPrismaMetrics } from './lib/prismaMetrics.js';
import healthRoutes from './api/routes/healthRoutes.js';
import tenantRoutes from './api/routes/tenantRoutes.js';
import wsHealthRoutes from './api/routes/wsHealth.js';
import prisma, { startConnectionMonitoring } from './lib/prisma.js';
import { errorsTotal } from './lib/metrics.js';
import { leaderboardRateLimit } from './middleware/rateLimit.js';
import metricsMiddleware from './middleware/metricsMiddleware.js';
import responseTime from './middleware/responseTime.js';
import logger, { getLogger } from './config/logger.js';
import emailService from './services/emailService.js';
import complianceService from './services/complianceService.js';
import { startIndexer } from './services/eventIndexer.js';
import { setupSwagger } from './api/docs/swagger.js';
import { getBackupStatus } from './services/backupMonitor.js';
import { syncFromPrisma, ensureIndex } from './services/reputationSearchService.js';
import { createGateway } from './gateway/index.js';

// Attach Prisma query instrumentation and monitoring
attachPrismaMetrics(prisma);
startConnectionMonitoring(prisma);

const PORT = process.env.PORT || 4000;
const app = express();

// ── Sentry request handler — must be first middleware ─────────────────────────
// Attaches trace context and request data to every event captured downstream.
app.use(Sentry.expressRequestHandler());

app.use(assignRequestContext);
app.use(httpRequestLogger);

app.use(helmet());
app.use(compressionMiddleware);
app.use(metricsMiddleware);
app.use(responseTime);
app.use(requestLogger);
app.use((req, res, next) => {
  const requestId = req.id || req.headers['x-request-id'] || req.headers['x-correlation-id'] || randomUUID();
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
});
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || 'http://localhost:3000',
    credentials: true,
  }),
);
app.use(express.json({ limit: REQUEST_SIZE_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: REQUEST_SIZE_LIMIT }));
app.use(cookieParser());
app.use(sanitizeInputs);
app.use(csrfProtection);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));
app.use(auditMiddleware);

// ── Sentry tracing handler — after body parsers, before routes ────────────────
app.use(Sentry.expressTracingHandler());

// ── API Gateway — centralized auth, rate limiting, logging, metrics ───────────
app.use('/api', ...createGateway());

// Leaderboard gets a tighter dedicated limit on top of the gateway limit
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
      getLogger().warn({
        message: 'health_db_pool_info_unavailable',
        error: poolError.message,
      });
    }
  } catch (error) {
    dbStatus = 'error';
    getLogger().error({
      message: 'health_database_check_failed',
      error: error.message,
      stack: error.stack,
    });
  }

  const backupStatus = await getBackupStatus();
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
    backup: backupStatus,
  });
});

app.get('/api/csrf-token', generateCsrfToken);

// ── API Routes ────────────────────────────────────────────────────────────────
// Auth is handled by the gateway above — no per-route authMiddleware needed.
app.use('/api/health', healthRoutes);
app.use('/ws/health', wsHealthRoutes);
app.use('/api', tenantMiddleware);
app.use('/api/auth', authRoutes);
app.use('/api/tenant', tenantRoutes);
app.use('/api/escrows', escrowRoutes);

// ── API Documentation ─────────────────────────────────────────────────────────
setupSwagger(app);
app.use('/api/users', userRoutes);
app.use('/api/reputation', reputationRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/relayer', relayerRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/compliance', complianceRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/batch', batchRoutes);
app.use('/docs', docsRouter);
// Alias — acceptance criteria requires /api-docs
app.use('/api-docs', docsRouter);

// ── Example: Deprecated API Version ───────────────────────────────────────────
// Uncomment to deprecate unversioned endpoints in favor of /api/v1
// app.use('/api', deprecateVersion(deprecationPresets.legacyUnversioned));

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  getLogger().warn({
    message: 'http_not_found',
    method: req.method,
    path: req.originalUrl?.split('?')[0],
  });
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

app.use((err, req, res, _next) => {
  const statusCode = err.statusCode || 500;

  // Attach Sentry event ID to response so support can correlate reports
  const sentryId = res.sentry;
  const body = { error: err.message || 'Internal server error' };
  if (sentryId) body.errorId = sentryId;

  const log = req?.log || logger;
  log.error(
    {
      err,
      statusCode,
      requestId: req?.id,
      route: req?.path || 'unknown',
      userId: req?.user?.userId,
    },
    'Unhandled error',
  );

  if (statusCode >= 500) {
    Sentry.captureException(err);
  }

  errorsTotal.inc({ type: err.name || 'Error', route: req?.path || 'unknown' });
  res.status(statusCode).json(body);
});

const server = http.createServer(app);
createWebSocketServer(server);

server.listen(PORT, async () => {
  // Load secrets first — merges vault/env secrets into process.env
  await initSecrets();
  logger.info({ secretsBackend: process.env.SECRETS_BACKEND || 'env' }, 'Secrets backend loaded');
  logger.info({ port: PORT, network: process.env.STELLAR_NETWORK }, 'API server started');
  await emailService.start();
  logger.info('[EmailService] Queue processor started');
  complianceService.startScheduler();
  logger.info('[ComplianceService] Scheduler started');
  logger.info('[WebSocket] Server attached');
  startIndexer().catch((err) => {
    logger.error({ err, component: 'indexer' }, 'Indexer failed to start');
    Sentry.captureException(err, { tags: { component: 'indexer' } });
  });

  // Reputation ES sync — initial + daily re-sync
  ensureIndex().then(() =>
    syncFromPrisma().catch((err) =>
      logger.warn({ err }, '[ReputationSearch] Initial sync failed'),
    ),
  );
  const MS_PER_DAY = 86_400_000;
  setInterval(
    () => syncFromPrisma().catch((err) => logger.warn({ err }, '[ReputationSearch] Daily sync failed')),
    MS_PER_DAY,
  );
});

export default app;
