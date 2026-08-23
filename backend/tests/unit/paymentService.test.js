import { jest } from '@jest/globals';

const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.unstable_mockModule('../../config/logger.js', () => ({
  createModuleLogger: () => loggerMock,
}));

const prismaMock = {
  payment: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};
jest.unstable_mockModule('../../lib/prisma.js', () => ({ default: prismaMock }));

const stripeInstanceMock = {
  checkout: { sessions: { create: jest.fn() } },
  refunds: { create: jest.fn() },
  webhooks: { constructEvent: jest.fn() },
};
jest.unstable_mockModule('stripe', () => ({
  default: jest.fn(() => stripeInstanceMock),
}));

let paymentService;

beforeAll(async () => {
  paymentService = (await import('../../services/paymentService.js')).default;
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = 'sk_test_123';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_123';
});

afterEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

describe('createCheckoutSession', () => {
  it('creates a Stripe session and a Pending Payment record', async () => {
    stripeInstanceMock.checkout.sessions.create.mockResolvedValue({
      id: 'cs_123',
      url: 'https://checkout.stripe.com/cs_123',
    });
    prismaMock.payment.create.mockResolvedValue({ id: 'pay_1' });

    const result = await paymentService.createCheckoutSession({
      address: 'GADDRESS...',
      amountUsd: 50,
      escrowId: '7',
    });

    expect(stripeInstanceMock.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        line_items: [expect.objectContaining({ price_data: expect.objectContaining({ unit_amount: 5000 }) })],
      }),
    );
    expect(prismaMock.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stripeSessionId: 'cs_123', amountFiat: 5000, status: 'Pending' }),
      }),
    );
    expect(result).toEqual({ checkoutUrl: 'https://checkout.stripe.com/cs_123', sessionId: 'cs_123', paymentId: 'pay_1' });
  });

  it('throws clearly when Stripe is not configured', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    await expect(
      paymentService.createCheckoutSession({ address: 'GADDRESS...', amountUsd: 10 }),
    ).rejects.toThrow('Stripe is not configured');
  });
});

describe('refund', () => {
  it('refunds a Completed payment and marks it Refunded', async () => {
    prismaMock.payment.findUnique.mockResolvedValue({
      id: 'pay_1',
      status: 'Completed',
      stripePaymentIntent: 'pi_123',
    });
    stripeInstanceMock.refunds.create.mockResolvedValue({ id: 're_123' });
    prismaMock.payment.update.mockResolvedValue({ id: 'pay_1', status: 'Refunded', refundId: 're_123' });

    const result = await paymentService.refund('pay_1');

    expect(stripeInstanceMock.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_123' });
    expect(result.status).toBe('Refunded');
  });

  it('rejects refunding a Pending payment', async () => {
    prismaMock.payment.findUnique.mockResolvedValue({ id: 'pay_2', status: 'Pending' });
    await expect(paymentService.refund('pay_2')).rejects.toThrow('Cannot refund');
    expect(stripeInstanceMock.refunds.create).not.toHaveBeenCalled();
  });

  it('rejects refunding an already-Refunded payment', async () => {
    prismaMock.payment.findUnique.mockResolvedValue({ id: 'pay_3', status: 'Refunded' });
    await expect(paymentService.refund('pay_3')).rejects.toThrow('Cannot refund');
  });

  it('throws when the payment does not exist', async () => {
    prismaMock.payment.findUnique.mockResolvedValue(null);
    await expect(paymentService.refund('nope')).rejects.toThrow('Payment not found');
  });
});

describe('handleWebhook', () => {
  it('marks a payment Completed on checkout.session.completed', async () => {
    stripeInstanceMock.webhooks.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_123', payment_intent: 'pi_999' } },
    });

    await paymentService.handleWebhook('{}', 'sig_test');

    expect(prismaMock.payment.updateMany).toHaveBeenCalledWith({
      where: { stripeSessionId: 'cs_123' },
      data: { status: 'Completed', stripePaymentIntent: 'pi_999' },
    });
  });

  it('marks a payment Failed on checkout.session.expired', async () => {
    stripeInstanceMock.webhooks.constructEvent.mockReturnValue({
      type: 'checkout.session.expired',
      data: { object: { id: 'cs_456' } },
    });

    await paymentService.handleWebhook('{}', 'sig_test');

    expect(prismaMock.payment.updateMany).toHaveBeenCalledWith({
      where: { stripeSessionId: 'cs_456' },
      data: { status: 'Failed' },
    });
  });

  it('propagates a signature verification failure', async () => {
    stripeInstanceMock.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('Invalid signature');
    });

    await expect(paymentService.handleWebhook('{}', 'bad_sig')).rejects.toThrow('Invalid signature');
    expect(prismaMock.payment.updateMany).not.toHaveBeenCalled();
  });

  it('ignores unrecognised event types without erroring', async () => {
    stripeInstanceMock.webhooks.constructEvent.mockReturnValue({
      type: 'customer.created',
      data: { object: {} },
    });

    await expect(paymentService.handleWebhook('{}', 'sig_test')).resolves.toEqual({ received: true });
    expect(prismaMock.payment.updateMany).not.toHaveBeenCalled();
  });
});

describe('read helpers', () => {
  it('getBySessionId reads by stripeSessionId', async () => {
    prismaMock.payment.findUnique.mockResolvedValue({ id: 'pay_1' });
    await paymentService.getBySessionId('cs_123');
    expect(prismaMock.payment.findUnique).toHaveBeenCalledWith({ where: { stripeSessionId: 'cs_123' } });
  });

  it('getByAddress orders by createdAt desc', async () => {
    prismaMock.payment.findMany.mockResolvedValue([]);
    await paymentService.getByAddress('GADDR...');
    expect(prismaMock.payment.findMany).toHaveBeenCalledWith({
      where: { address: 'GADDR...' },
      orderBy: { createdAt: 'desc' },
    });
  });
});
