import { jest } from '@jest/globals';

const ADDRESS_A = `G${'A'.repeat(55)}`;
const ADDRESS_B = `G${'B'.repeat(55)}`;

const paymentServiceMock = {
  createCheckoutSession: jest.fn(),
  getBySessionId: jest.fn(),
  getByAddress: jest.fn(),
  getById: jest.fn(),
  refund: jest.fn(),
  handleWebhook: jest.fn(),
};

const kycServiceMock = {
  getStatus: jest.fn(),
};

jest.unstable_mockModule('../services/paymentService.js', () => ({
  default: paymentServiceMock,
}));

jest.unstable_mockModule('../services/kycService.js', () => ({
  default: kycServiceMock,
}));

const { default: paymentController } = await import('../api/controllers/paymentController.js');

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status: jest.fn().mockImplementation(function (code) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn().mockImplementation(function (payload) {
      this.body = payload;
      return this;
    }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('paymentController authorization', () => {
  it('rejects checkout when the requested wallet does not match the JWT wallet', async () => {
    const req = {
      body: { address: ADDRESS_A, amountUsd: 10 },
      user: { address: ADDRESS_B },
    };
    const res = createMockRes();

    await paymentController.createCheckout(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(paymentServiceMock.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('rejects payment status lookup for another wallet', async () => {
    const req = {
      params: { sessionId: 'sess_123' },
      user: { address: ADDRESS_A },
    };
    const res = createMockRes();

    paymentServiceMock.getBySessionId.mockResolvedValue({
      id: 'pay_123',
      address: ADDRESS_B,
      status: 'Completed',
    });

    await paymentController.getStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('rejects refunds for payments owned by another wallet', async () => {
    const req = {
      params: { paymentId: 'pay_123' },
      user: { address: ADDRESS_A },
    };
    const res = createMockRes();

    paymentServiceMock.getById.mockResolvedValue({
      id: 'pay_123',
      address: ADDRESS_B,
      status: 'Completed',
    });

    await paymentController.refund(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(paymentServiceMock.refund).not.toHaveBeenCalled();
  });

  it('returns 404 when refund target payment does not exist', async () => {
    const req = {
      params: { paymentId: 'pay_missing' },
      user: { address: ADDRESS_A },
    };
    const res = createMockRes();

    paymentServiceMock.getById.mockResolvedValue(null);

    await paymentController.refund(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(paymentServiceMock.refund).not.toHaveBeenCalled();
  });
});
