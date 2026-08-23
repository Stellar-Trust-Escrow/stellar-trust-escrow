import { jest } from '@jest/globals';
import request from 'supertest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const prismaMock = {
  paymentStream: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn(async (ops) => (Array.isArray(ops) ? Promise.all(ops) : ops)),
};
jest.unstable_mockModule('../../lib/prisma.js', () => ({ default: prismaMock }));

const stellarSdkMock = {
  SorobanRpc: {
    Server: jest.fn(() => ({
      getAccount: jest.fn().mockResolvedValue({ accountId: () => 'recipient_g' }),
      simulateTransaction: jest.fn().mockResolvedValue({ result: {} }),
    })),
    isSimulationError: jest.fn(() => false),
    assembleTransaction: jest.fn(() => ({
      build: jest.fn(() => ({
        toXDR: jest.fn(() => 'mock_xdr_base64'),
      })),
    })),
  },
  TransactionBuilder: jest.fn(() => ({
    addOperation: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn(() => ({
      toXDR: jest.fn(() => 'mock_xdr_base64'),
    })),
  })),
  Contract: jest.fn(() => ({
    call: jest.fn(),
  })),
  Address: jest.fn(() => ({
    toScVal: jest.fn(),
  })),
  nativeToScVal: jest.fn(),
  scValToNative: jest.fn(() => BigInt(0)),
  BASE_FEE: '100',
  xdr: { ScVal: { fromXDR: jest.fn() } },
};
jest.unstable_mockModule('@stellar/stellar-sdk', () => stellarSdkMock);

const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.unstable_mockModule('../../config/logger.js', () => ({
  createModuleLogger: () => loggerMock,
  logControllerError: jest.fn(),
}));

jest.unstable_mockModule('../../api/middleware/auth.js', () => ({
  default: (req, res, next) => {
    req.user = { walletAddress: req.headers['x-wallet-address'] || 'user123' };
    next();
  },
}));

// ── Import ────────────────────────────────────────────────────────────────────

// streamController.js reads STREAMING_CONTRACT_ID at module-load time, so it
// must be set before the controller is imported below.
process.env.STREAMING_CONTRACT_ID = 'CSTREAMTESTCONTRACTID';

const express = (await import('express')).default;
const streamRoutes = (await import('../../api/routes/streamRoutes.js')).default;
const streamController = (await import('../../api/controllers/streamController.js')).default;

// ── Setup ─────────────────────────────────────────────────────────────────────

let app;

beforeEach(() => {
  jest.clearAllMocks();
  app = express();
  app.use(express.json());
  app.use('/api/v1/streams', streamRoutes);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('streamRoutes — GET /api/v1/streams', () => {
  it('returns paginated streams for authenticated user', async () => {
    const mockStreams = [
      {
        streamId: BigInt(1),
        senderAddress: 'user123',
        recipientAddress: 'recipient_g',
        tokenAddress: 'token_g',
        totalAmount: '100000000000',
        ratePerSecond: '10000000',
        status: 'Active',
        claimedTotal: '0',
        createdAt: new Date(),
      },
    ];

    prismaMock.paymentStream.findMany.mockResolvedValue(mockStreams);

    const res = await request(app)
      .get('/api/v1/streams')
      .set('x-wallet-address', 'user123');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination).toBeDefined();
  });

  it('filters by status', async () => {
    prismaMock.paymentStream.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/streams?status=Cancelled')
      .set('x-wallet-address', 'user123');

    expect(res.status).toBe(200);
    const whereArg = prismaMock.paymentStream.findMany.mock.calls[0][0].where;
    expect(whereArg.status).toBe('Cancelled');
  });
});

describe('streamRoutes — GET /api/v1/streams/:streamId', () => {
  it('returns stream details', async () => {
    const mockStream = {
      streamId: BigInt(42),
      senderAddress: 'sender_g',
      recipientAddress: 'recipient_g',
      status: 'Active',
    };
    prismaMock.paymentStream.findUnique.mockResolvedValue(mockStream);

    const res = await request(app)
      .get('/api/v1/streams/42')
      .set('x-wallet-address', 'user123');

    expect(res.status).toBe(200);
    expect(res.body.streamId).toBeDefined();
  });

  it('returns 404 for non-existent stream', async () => {
    prismaMock.paymentStream.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/streams/999')
      .set('x-wallet-address', 'user123');

    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid stream id', async () => {
    prismaMock.paymentStream.findUnique.mockRejectedValue(new Error('Cannot convert'));

    const res = await request(app)
      .get('/api/v1/streams/invalid')
      .set('x-wallet-address', 'user123');

    expect(res.status).toBe(400);
  });
});

describe('streamRoutes — POST /api/v1/streams/:streamId/claim', () => {
  it('builds unsigned claim XDR', async () => {
    const mockAccount = { sequenceNumber: '0' };
    const mockServer = {
      getAccount: jest.fn().mockResolvedValue(mockAccount),
      simulateTransaction: jest.fn().mockResolvedValue({
        result: { retval: 'mock_retval' },
      }),
    };
    stellarSdkMock.SorobanRpc.Server.mockImplementation(() => mockServer);

    const res = await request(app)
      .post('/api/v1/streams/42/claim')
      .set('x-wallet-address', 'user123')
      .send({ recipientAddress: 'recipient_g' });

    expect(res.status).toBe(200);
    expect(res.body.unsignedXdr).toBe('mock_xdr_base64');
    expect(res.body.streamId).toBe('42');
  });

  it('returns 400 when recipientAddress missing', async () => {
    const res = await request(app)
      .post('/api/v1/streams/42/claim')
      .set('x-wallet-address', 'user123')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('recipientAddress is required');
  });
});
