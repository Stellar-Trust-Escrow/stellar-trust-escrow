/**
 * Integration tests for the KYC pipeline:
 *   - POST /api/kyc/webhook HMAC verification
 *   - GET  /api/kyc/status authentication guard
 *   - Escrow creation gate via kycGate middleware
 *
 * Uses the in-memory Prisma mock client (moduleNameMapper in jest.config.js).
 * The real kycService and kycController are exercised — no service-level mocks.
 */

import { jest } from '@jest/globals';
import crypto from 'crypto';

// ── Silence logger ────────────────────────────────────────────────────────────
const _mockLoggerInstance = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn().mockReturnThis(),
};
jest.unstable_mockModule('../../config/logger.js', () => ({
  default: _mockLoggerInstance,
  createModuleLogger: () => _mockLoggerInstance,
  getLogger: () => _mockLoggerInstance,
  logControllerError: jest.fn(),
  requestContext: { getStore: jest.fn().mockReturnValue(null) },
}));

// ── Silence sliding rate limiter (used by adminAuth) ──────────────────────────
jest.unstable_mockModule('../../api/middleware/slidingRateLimiter.js', () => ({
  createBruteForceGuard: () => ({
    lockTtl: jest.fn().mockResolvedValue(0),
    recordFailure: jest.fn().mockResolvedValue({ failures: 1, locked: false }),
  }),
}));

// ── Dynamic imports after mocks ───────────────────────────────────────────────
const { default: express } = await import('express');
const prisma = (await import('../../lib/prisma.js')).default;
const { default: kycRoutes } = await import('../../api/routes/kycRoutes.js');
const { default: supertest } = await import('supertest');

// ── Build a minimal Express app for testing ───────────────────────────────────
// NOTE: Do NOT add global express.json() here — the webhook route uses
// captureRawBody + its own express.json(), and global parsing would consume
// the stream before captureRawBody can read it (causing a timeout).
function buildApp() {
  const app = express();

  // Inject tenant context
  app.use((req, _res, next) => {
    req.tenantId = 'tenant_test';
    next();
  });

  app.use('/api/kyc', kycRoutes);
  return app;
}

const app = buildApp();
const request = supertest(app);

const WEBHOOK_SECRET = 'test-secret';
const ADDRESS = 'GINTEGRATION123TEST';
const APPLICANT_ID = `applicant_${ADDRESS}`;

function makeHmacToken(body) {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
}

beforeEach(async () => {
  await prisma.kycVerification.deleteMany({});
  await prisma.kycWebhookLog.deleteMany({});
});

// ── Webhook HMAC tests ────────────────────────────────────────────────────────

describe('POST /api/kyc/webhook — HMAC verification', () => {
  it('returns 401 when X-App-Token is missing', async () => {
    const body = JSON.stringify({ applicantId: APPLICANT_ID, type: 'applicantReviewed' });
    const res = await request
      .post('/api/kyc/webhook')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/signature/i);
  });

  it('returns 401 when X-App-Token is wrong', async () => {
    const body = JSON.stringify({ applicantId: APPLICANT_ID, type: 'applicantReviewed' });
    const res = await request
      .post('/api/kyc/webhook')
      .set('Content-Type', 'application/json')
      .set('x-app-token', 'deadbeef')
      .send(body);

    expect(res.status).toBe(401);
  });

  it('returns 200 when X-App-Token is valid + GREEN reviewAnswer', async () => {
    // Seed a KycVerification record so processWebhook can update it
    await prisma.kycVerification.create({
      data: {
        tenantId: 'tenant_test',
        address: ADDRESS,
        applicantId: APPLICANT_ID,
        status: 'Pending',
      },
    });

    const payload = {
      applicantId: APPLICANT_ID,
      type: 'applicantReviewed',
      reviewResult: { reviewAnswer: 'GREEN', rejectLabels: [] },
    };
    const body = JSON.stringify(payload);
    const token = makeHmacToken(body);

    const res = await request
      .post('/api/kyc/webhook')
      .set('Content-Type', 'application/json')
      .set('x-app-token', token)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ processed: true, status: 'Approved' });
  });
});

// ── Status auth guard ─────────────────────────────────────────────────────────

describe('GET /api/kyc/status/:address — auth guard', () => {
  it('returns 401 when no auth token provided', async () => {
    const res = await request.get(`/api/kyc/status/${ADDRESS}`);
    expect(res.status).toBe(401);
  });
});

// ── KYC gate middleware ───────────────────────────────────────────────────────

describe('kycGate middleware — escrow creation gate', () => {
  it('allows requests below the threshold without checking KYC', async () => {
    const { requireKycAbove } = await import('../../api/middleware/kycGate.js');

    const middleware = requireKycAbove(1000);
    const req = { body: { totalAmount: '500' }, tenantId: 'tenant_test' };
    const next = jest.fn();
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 401 when amount exceeds threshold but no user address', async () => {
    const { requireKycAbove } = await import('../../api/middleware/kycGate.js');

    const middleware = requireKycAbove(1000);
    const req = { body: { totalAmount: '2000' }, tenantId: 'tenant_test', user: null };
    const next = jest.fn();
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when amount exceeds threshold and KYC not Approved', async () => {
    const { requireKycAbove } = await import('../../api/middleware/kycGate.js');

    // Seed a Pending KYC record
    await prisma.kycVerification.create({
      data: {
        tenantId: 'tenant_test',
        address: ADDRESS,
        applicantId: APPLICANT_ID,
        status: 'Pending',
      },
    });

    const middleware = requireKycAbove(1000);
    const req = {
      body: { totalAmount: '2000' },
      tenantId: 'tenant_test',
      user: { stellarAddress: ADDRESS },
    };
    const next = jest.fn();
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'KYC required', code: 'KYC_REQUIRED' });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when KYC is Approved and amount exceeds threshold', async () => {
    const { requireKycAbove } = await import('../../api/middleware/kycGate.js');

    await prisma.kycVerification.create({
      data: {
        tenantId: 'tenant_test',
        address: ADDRESS,
        applicantId: APPLICANT_ID,
        status: 'Approved',
      },
    });

    const middleware = requireKycAbove(1000);
    const req = {
      body: { totalAmount: '5000' },
      tenantId: 'tenant_test',
      user: { stellarAddress: ADDRESS },
    };
    const next = jest.fn();
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
