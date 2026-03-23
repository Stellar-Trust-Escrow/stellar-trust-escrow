/**
 * StellarTrustEscrow — Backend Server
 *
 * Express.js REST API server. Serves escrow data indexed from the Stellar
 * blockchain and provides endpoints for the Next.js frontend.
 *
 * @module server
 */

/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-unused-vars */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import escrowRoutes from './api/routes/escrowRoutes.js';
import userRoutes from './api/routes/userRoutes.js';
import reputationRoutes from './api/routes/reputationRoutes.js';
import disputeRoutes from './api/routes/disputeRoutes.js';
import adminRoutes from './api/routes/adminRoutes.js';

// TODO (contributor — easy, Issue #17): Import and start the escrow indexer
// const { startIndexer } = require('./services/escrowIndexer');

const app = express();
const PORT = process.env.PORT || 4000;

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(helmet());
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || 'http://localhost:3000',
    credentials: true,
  }),
);
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting — TODO (contributor — easy): tune limits per route
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api/', limiter);

// ── Health Check ──────────────────────────────────────────────────────────────

/**
 * @route GET /health
 * @desc  Basic health check — useful for deployment monitoring
 * @returns {{ status: string, timestamp: string }}
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Routes ────────────────────────────────────────────────────────────────────

app.use('/api/escrows', escrowRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reputation', reputationRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/admin', adminRoutes);

// ── 404 Handler ───────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Error Handler ─────────────────────────────────────────────────────────────

/**
 * Global error handler.
 * TODO (contributor — easy, Issue #18): Improve error responses with
 * structured error codes matching the Soroban contract's EscrowError enum.
 */
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(err.statusCode || 500).json({
    error: err.message || 'Internal server error',
    // TODO: add error code field
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
  console.log(`🚀 StellarTrustEscrow API running on port ${PORT}`);
  console.log(`🌐 Network: ${process.env.STELLAR_NETWORK}`);

  // TODO (contributor — Issue #17): Start the indexer
  // try {
  //   await startIndexer();
  //   console.log('📡 Escrow indexer started');
  // } catch (err) {
  //   console.error('Failed to start indexer:', err);
  // }
});

export default app; // for testing
