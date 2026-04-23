import { jest } from '@jest/globals';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const ADDRESS_A = `G${'A'.repeat(55)}`;
const ADDRESS_B = `G${'B'.repeat(55)}`;
const ADMIN_API_KEY = 'test-admin-key';

process.env.ADMIN_API_KEY = ADMIN_API_KEY;

const okHandler = (_req, res) => res.json({ ok: true });

const emailServiceMock = {
  notifyEscrowStatusChange: jest.fn(async () => ({ queued: 1 })),
  notifyMilestoneCompleted: jest.fn(async () => ({ queued: 1 })),
  notifyDisputeRaised: jest.fn(async () => ({ queued: 1 })),
  unsubscribe: jest.fn(async () => ({ email: 'user@example.com', unsubscribedAt: 'now' })),
  getPreference: jest.fn(async () => ({
    email: 'user@example.com',
    unsubscribeToken: 'valid-token',
    unsubscribedAt: 'now',
  })),
  resubscribe: jest.fn(async () => ({ email: 'user@example.com', unsubscribedAt: null })),
  getQueueSnapshot: jest.fn(async () => ({ queue: [], deliveries: [] })),
};

const metricStub = () => ({
  inc: jest.fn(),
  observe: jest.fn(),
  set: jest.fn(),
  dec: jest.fn(),
});

const relayerMock = {
  executeMetaTransaction: jest.fn(async () => ({
    success: true,
    transactionHash: 'tx_hash',
    ledger: 123,
    metaTxNonce: 7,
  })),
  estimateFee: jest.fn(async () => 100),
  relayerKeypair: { publicKey: () => ADDRESS_A },
};

jest.unstable_mockModule('../api/controllers/authController.js', () => ({
  default: {
    register: okHandler,
    login: okHandler,
    refresh: okHandler,
    logout: okHandler,
    revokeAll: okHandler,
    sessions: okHandler,
  },
}));

jest.unstable_mockModule('../api/controllers/escrowController.js', () => ({
  default: {
    listEscrows: okHandler,
    broadcastCreateEscrow: okHandler,
    getMilestones: okHandler,
    getMilestone: okHandler,
    getEscrow: okHandler,
  },
  validateBroadcast: [okHandler],
  validateEscrowId: [okHandler],
  validatePagination: [okHandler],
}));

jest.unstable_mockModule('../api/controllers/disputeController.js', () => ({
  default: {
    listDisputes: okHandler,
    getResolutionHistory: okHandler,
    getDispute: okHandler,
    uploadEvidence: okHandler,
    postEvidence: okHandler,
    listEvidence: okHandler,
    autoResolve: okHandler,
    getRecommendation: okHandler,
    postAppeal: okHandler,
    patchAppeal: okHandler,
  },
}));

jest.unstable_mockModule('../api/controllers/userController.js', () => ({
  default: {
    getUserProfile: okHandler,
    getUserEscrows: okHandler,
    getUserStats: okHandler,
  },
}));

jest.unstable_mockModule('../api/controllers/exportController.js', () => ({
  default: {
    exportUserData: okHandler,
    importUserData: okHandler,
    downloadExportFile: okHandler,
  },
}));

jest.unstable_mockModule('../api/controllers/kycController.js', () => ({
  default: {
    getToken: okHandler,
    getStatus: okHandler,
    webhook: okHandler,
    adminList: okHandler,
  },
}));

jest.unstable_mockModule('../api/controllers/paymentController.js', () => ({
  default: {
    webhook: okHandler,
    createCheckout: okHandler,
    getStatus: okHandler,
    listByAddress: okHandler,
    refund: okHandler,
  },
}));

jest.unstable_mockModule('../api/middleware/cache.js', () => ({
  TTL: {
    LIST: 30,
    DETAIL: 30,
    STATIC: 30,
    EVENTS: 30,
    LEADERBOARD: 30,
    REPUTATION: 30,
  },
  cacheResponse: () => (_req, _res, next) => next(),
  invalidateOn: () => (_req, _res, next) => next(),
}));

jest.unstable_mockModule('../services/emailService.js', () => ({
  default: emailServiceMock,
}));

jest.unstable_mockModule('../services/relayerService.js', () => ({
  createRelayer: jest.fn(() => relayerMock),
}));

jest.unstable_mockModule('../lib/metrics.js', () => ({
  register: { metrics: jest.fn(async () => '') },
  httpRequestDuration: metricStub(),
  httpRequestTotal: metricStub(),
  httpRequestsInFlight: metricStub(),
  dbQueryDuration: metricStub(),
  dbQueryTotal: metricStub(),
  dbSlowQueryTotal: metricStub(),
  dbConnectionsTotal: metricStub(),
  dbConnectionsActive: metricStub(),
  dbConnectionsIdle: metricStub(),
  dbConnectionErrorsTotal: metricStub(),
  dbConnectionPoolExhaustionTotal: metricStub(),
  cacheHitsTotal: metricStub(),
  cacheMissesTotal: metricStub(),
  cacheSize: metricStub(),
  escrowsCreatedTotal: metricStub(),
  disputesRaisedTotal: metricStub(),
  milestonesCompletedTotal: metricStub(),
  activeEscrowsGauge: metricStub(),
  circuitBreakerState: metricStub(),
  circuitBreakerCallsTotal: metricStub(),
  circuitBreakerTransitionsTotal: metricStub(),
  chaosInjectedTotal: metricStub(),
  errorsTotal: metricStub(),
  compressedResponsesTotal: metricStub(),
  compressionBytesTotal: metricStub(),
  compressionRatio: metricStub(),
}));

const { default: authRoutes } = await import('../api/routes/authRoutes.js');
const { default: escrowRoutes } = await import('../api/routes/escrowRoutes.js');
const { default: disputeRoutes } = await import('../api/routes/disputeRoutes.js');
const { default: userRoutes } = await import('../api/routes/userRoutes.js');
const { default: kycRoutes } = await import('../api/routes/kycRoutes.js');
const { default: paymentRoutes } = await import('../api/routes/paymentRoutes.js');
const { default: notificationRoutes } = await import('../api/routes/notificationRoutes.js');
const { default: relayerRoutes } = await import('../api/routes/relayerRoutes.js');

function bearerToken(address = ADDRESS_A) {
  return `Bearer ${jwt.sign(
    { userId: 1, tenantId: 'tenant_default', address, type: 'access' },
    process.env.JWT_ACCESS_SECRET || 'fallback_access_secret',
  )}`;
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/escrows', escrowRoutes);
  app.use('/api/disputes', disputeRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/kyc', kycRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/relayer', relayerRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.RELAYER_SECRET_KEY = 'test-relayer-secret';
});

describe('API route protection', () => {
  it('allows logout with a refresh token payload and also accepts bearer auth', async () => {
    const app = createApp();

    await request(app).post('/api/auth/logout').send({ refreshToken: 'token' }).expect(200);

    await request(app)
      .post('/api/auth/logout')
      .set('Authorization', bearerToken())
      .send({ refreshToken: 'token' })
      .expect(200);
  });

  it('protects escrow and dispute routers with bearer auth', async () => {
    const app = createApp();

    await request(app).get('/api/escrows').expect(401);
    await request(app).get('/api/disputes').expect(401);

    await request(app).get('/api/escrows').set('Authorization', bearerToken()).expect(200);
    await request(app).get('/api/disputes').set('Authorization', bearerToken()).expect(200);
  });

  it('restricts user export routes to the authenticated wallet', async () => {
    const app = createApp();

    await request(app)
      .get(`/api/users/${ADDRESS_A}/export`)
      .set('Authorization', bearerToken(ADDRESS_B))
      .expect(403);

    await request(app)
      .get(`/api/users/${ADDRESS_A}/export`)
      .set('Authorization', bearerToken(ADDRESS_A))
      .expect(200);
  });

  it('restricts KYC status and payment checkout to the authenticated wallet', async () => {
    const app = createApp();

    await request(app)
      .get(`/api/kyc/status/${ADDRESS_A}`)
      .set('Authorization', bearerToken(ADDRESS_B))
      .expect(403);

    await request(app)
      .post('/api/payments/checkout')
      .set('Authorization', bearerToken(ADDRESS_B))
      .send({ address: ADDRESS_A, amountUsd: 25 })
      .expect(403);

    await request(app)
      .get(`/api/kyc/status/${ADDRESS_A}`)
      .set('Authorization', bearerToken(ADDRESS_A))
      .expect(200);

    await request(app)
      .post('/api/payments/checkout')
      .set('Authorization', bearerToken(ADDRESS_A))
      .send({ address: ADDRESS_A, amountUsd: 25 })
      .expect(200);
  });

  it('protects internal notification endpoints with the admin API key', async () => {
    const app = createApp();

    await request(app)
      .post('/api/notifications/events')
      .send({
        eventType: 'escrow.status_changed',
        data: { recipients: [{ email: 'user@example.com' }] },
      })
      .expect(401);

    await request(app).get('/api/notifications/queue').expect(401);

    await request(app)
      .post('/api/notifications/events')
      .set('x-admin-api-key', ADMIN_API_KEY)
      .send({
        eventType: 'escrow.status_changed',
        data: { recipients: [{ email: 'user@example.com' }] },
      })
      .expect(202);

    await request(app)
      .get('/api/notifications/queue')
      .set('x-admin-api-key', ADMIN_API_KEY)
      .expect(200);
  });

  it('requires a resubscribe token for notification subscribe', async () => {
    const app = createApp();

    await request(app)
      .post('/api/notifications/subscribe')
      .send({ email: 'user@example.com' })
      .expect(400);

    await request(app)
      .post('/api/notifications/subscribe')
      .send({ email: 'user@example.com', token: 'wrong-token' })
      .expect(403);

    await request(app)
      .post('/api/notifications/subscribe')
      .send({ email: 'user@example.com', token: 'valid-token' })
      .expect(200);
  });

  it('protects relayer execution endpoints with bearer auth', async () => {
    const app = createApp();

    await request(app)
      .post('/api/relayer/execute')
      .send({ metaTx: { nonce: 1 } })
      .expect(401);

    await request(app)
      .post('/api/relayer/execute')
      .set('Authorization', bearerToken())
      .send({ metaTx: { nonce: 1 } })
      .expect(200);
  });
});
