import { initTracing } from './lib/tracing.js';
// Tracing and Sentry must be initialised before other imports so instrumentation patches apply.
initTracing();
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
import { requestLogger } from './lib/logger.js';

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
import webhookRoutes from './api/routes/webhookRoutes.js';
import tenantMiddleware from './api/middleware/tenant.js';
import auditMiddleware from './api/middleware/audit.js';
import { createWebSocketServer, pool } from './api/websocket/handlers.js';
import cache from './lib/cache.js';
import { attachPrismaMetrics } from './lib/prismaMetrics.js';
import { attachPrismaTracing } from './lib/prismaTracing.js';
import healthRoutes from './api/routes/healthRoutes.js';
import tenantRoutes from './api/routes/tenantRoutes.js';
import wsHealthRoutes from './api/routes/wsHealth.js';
import prisma, { startConnectionMonitoring } from './lib/prisma.js';
import { errorsTotal } from './lib/metrics.js';
import { leaderboardRateLimit } from './middleware/rateLimit.js';
import { authRateLimit, routeTierLimiter } from './middleware/tieredRateLimit.js';
import metricsMiddleware from './middleware/metricsMiddleware.js';
import responseTime from './middleware/responseTime.js';
import tracingMiddleware from './middleware/tracingMiddleware.js';
import logger, { getLogger } from './config/logger.js';
import emailService from './services/emailService.js';
import complianceService from './services/complianceService.js';
import { startIndexer } from './services/eventIndexer.js';
import { startRpcMonitor } from './monitoring/rpcMonitor.js';
import { createEventWorker, createDeadLetterWorker } from './services/eventWorker.js';
import { setupSwagger } from './api/docs/swagger.js';
import { syncFromPrisma, ensureIndex } from './services/reputationSearchService.js';
import stellarMonitor from './services/stellarMonitorService.js';
import { createGateway } from './gateway/index.js';
import queueDashboardRoutes from './api/routes/queueDashboardRoutes.js';
import v1Router from './api/v1/index.js';

// Attach Prisma query instrumentation (metrics + traces)
attachPrismaMetrics(prisma);
attachPrismaTracing(prisma);

const PORT = process.env.PORT || 4000;
const app = express();

// ── In-flight request tracking (for graceful shutdown) ────────────────────────
let inFlightCount = 0;

function inFlightTracker(req, res, next) {
  inFlightCount++;
  res.on('finish', () => { inFlightCount--; });
  res.on('close', () => { inFlightCount--; });
  next();
}
const sentryRequestHandler = Sentry.expressRequestHandler?.() ?? ((_req, _res, next) => next());
const sentryTracingHandler = Sentry.expressTracingHandler?.() ?? ((_req, _res, next) => next());
const sentryErrorHandler =
  Sentry.expressErrorHandler?.({
    shouldHandleError(err) {
      return !err.statusCode || err.statusCode >= 500;
    },
  }) ?? ((err, _req, _res, next) => next(err));

// ── Sentry request handler — must be first middleware ─────────────────────────
// Attaches trace context and request data to every event captured downstream.
app.use(sentryRequestHandler);
app.use(inFlightTracker);

app.use(helmet());
app.use(compressionMiddleware);
app.use(metricsMiddleware);
app.use(responseTime);
app.use(tracingMiddleware);
app.use(requestLogger);
app.use((req, res, next) => {
  const requestId =
    req.id || req.headers['x-request-id'] || req.headers['x-correlation-id'] || randomUUID();
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
app.use('/uploads', express.static('uploads'));
app.use(auditMiddleware);

// ── Sentry tracing handler — after body parsers, before routes ────────────────
app.use(sentryTracingHandler);

// ── API Gateway — centralized auth, rate limiting, logging, metrics ───────────
app.use('/api', ...createGateway());

// Leaderboard gets a tighter dedicated limit on top of the gateway limit
app.use('/api/reputation/leaderboard', leaderboardRateLimit);

// ── Top-level health probes (no auth required, outside the API gateway) ───────
// Mounts GET /health, GET /health/live, GET /health/ready
app.use('/health', healthRoutes);

app.get('/api/csrf-token', generateCsrfToken);

// ── API Routes ────────────────────────────────────────────────────────────────
// Auth is handled by the gateway above — no per-route authMiddleware needed.
app.use('/api/health', healthRoutes);
app.use('/ws/health', wsHealthRoutes);
app.use('/api', tenantMiddleware);
app.use('/api/auth', authRateLimit, authRoutes);
app.use('/api/tenant', tenantRoutes);
app.use('/api/escrows', routeTierLimiter, escrowRoutes);

// ── API Documentation ─────────────────────────────────────────────────────────
setupSwagger(app);
app.use('/api/users', routeTierLimiter, userRoutes);
app.use('/api/reputation', routeTierLimiter, reputationRoutes);
app.use('/api/disputes', routeTierLimiter, disputeRoutes);
app.use('/api/notifications', routeTierLimiter, notificationRoutes);
app.use('/api/events', routeTierLimiter, eventRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/kyc', routeTierLimiter, kycRoutes);
app.use('/api/payments', routeTierLimiter, paymentRoutes);
app.use('/api/relayer', routeTierLimiter, relayerRoutes);
app.use('/api/audit', routeTierLimiter, auditRoutes);
app.use('/api/compliance', routeTierLimiter, complianceRoutes);
app.use('/api/incidents', routeTierLimiter, incidentRoutes);
app.use('/api/admin', routeTierLimiter, adminRoutes);
app.use('/api/batch', routeTierLimiter, batchRoutes);
app.use('/api/search', routeTierLimiter, searchRoutes);
app.use('/admin/queues', queueDashboardRoutes);
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
app.use(sentryErrorHandler);

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

async function startServer() {
  return new Promise((resolve, reject) => {
    server.listen(PORT, async () => {
      try {
        startConnectionMonitoring(prisma);
        // Load secrets first — merges vault/env secrets into process.env
        await initSecrets();
        logger.info(
          { secretsBackend: process.env.SECRETS_BACKEND || 'env' },
          'Secrets backend loaded',
        );
        logger.info({ port: PORT, network: process.env.STELLAR_NETWORK }, 'API server started');
        await emailService.start();
        logger.info('[EmailService] Queue processor started');
        complianceService.startScheduler();
        logger.info('[ComplianceService] Scheduler started');
        logger.info('[WebSocket] Server attached');

        let eventWorker, deadLetterWorker;
        try {
          eventWorker = createEventWorker();
          deadLetterWorker = createDeadLetterWorker();
          logger.info('[BullMQ] Event processing workers started');

          const closeWorkers = async () => {
            logger.info('[BullMQ] Shutting down workers...');
            await eventWorker.close();
            await deadLetterWorker.close();
            stellarMonitor.stop();
          };

          process.once('SIGTERM', closeWorkers);
          process.once('SIGINT', closeWorkers);
        } catch (error) {
          logger.error({ err: error }, '[BullMQ] Failed to start workers');
          Sentry.captureException(error, { tags: { component: 'bullmq-workers' } });
        }

        // ── Graceful shutdown ─────────────────────────────────────────────────
        const GRACE_PERIOD_MS = parseInt(process.env.SHUTDOWN_GRACE_MS || '30000', 10);

        async function gracefulShutdown(signal) {
          logger.info({ signal, ts: new Date().toISOString() }, '[Shutdown] Signal received — stopping new connections');

          // 1. Stop accepting new connections
          server.close(() => {
            logger.info({ ts: new Date().toISOString() }, '[Shutdown] HTTP server closed');
          });

          // 2. Wait for in-flight requests (up to grace period)
          const deadline = Date.now() + GRACE_PERIOD_MS;
          while (inFlightCount > 0 && Date.now() < deadline) {
            logger.info({ inFlightCount, ts: new Date().toISOString() }, '[Shutdown] Draining in-flight requests');
            await new Promise((r) => setTimeout(r, 250));
          }
          if (inFlightCount > 0) {
            logger.warn({ inFlightCount, ts: new Date().toISOString() }, '[Shutdown] Grace period expired — forcing shutdown');
          } else {
            logger.info({ ts: new Date().toISOString() }, '[Shutdown] All in-flight requests drained');
          }

          // 3. Close BullMQ workers
          if (eventWorker || deadLetterWorker) {
            logger.info({ ts: new Date().toISOString() }, '[Shutdown] Closing BullMQ workers');
            await Promise.allSettled([eventWorker?.close(), deadLetterWorker?.close()]);
          }

          // 4. Close DB connection pool
          logger.info({ ts: new Date().toISOString() }, '[Shutdown] Disconnecting database');
          await prisma.$disconnect().catch((e) => logger.error({ err: e }, '[Shutdown] DB disconnect error'));

          // 5. Close Redis / cache
          logger.info({ ts: new Date().toISOString() }, '[Shutdown] Closing cache connections');
          await cache.close?.().catch?.((e) => logger.error({ err: e }, '[Shutdown] Cache close error'));

          logger.info({ ts: new Date().toISOString() }, '[Shutdown] Clean exit');
          process.exit(0);
        }

        process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.once('SIGINT', () => gracefulShutdown('SIGINT'));

        startIndexer().catch((err) => {
          logger.error({ err, component: 'indexer' }, 'Indexer failed to start');
          Sentry.captureException(err, { tags: { component: 'indexer' } });
        });
        startRpcMonitor();

        stellarMonitor.start().catch((err) => {
          logger.error({ err, component: 'stellar-monitor' }, 'StellarMonitor failed to start');
          Sentry.captureException(err, { tags: { component: 'stellar-monitor' } });
        });

        // Reputation ES sync — ensure index + initial sync on startup
        ensureIndex().then(() =>
          syncFromPrisma().catch((err) =>
            logger.warn({ err }, '[ReputationSearch] Initial sync failed'),
          ),
        );
        resolve(server);
      } catch (error) {
        reject(error);
      }
    });
  });
}

if (
  process.env.NODE_ENV !== 'test' &&
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  startServer().catch((error) => {
    logger.error({ err: error }, 'Failed to start API server');
    process.exitCode = 1;
  });
}

export default app;
export { server, startServer };
