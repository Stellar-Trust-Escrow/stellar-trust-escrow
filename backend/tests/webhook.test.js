import { jest } from '@jest/globals';

const prismaMock = {
  webhookSubscription: {
    create: jest.fn(),
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  webhookDelivery: {
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
  },
};

const queueMock = {
  enqueueWebhookDelivery: jest.fn(),
};

describe('Webhook Service and Worker', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
    jest.unstable_mockModule('../queues/webhookQueue.js', () => ({
      enqueueWebhookDelivery: queueMock.enqueueWebhookDelivery,
    }));
  });

  it('creates a webhook subscription and returns a secret', async () => {
    const url = 'https://example.com/webhook';
    const eventTypes = ['esc_crt', 'funds_rel'];
    prismaMock.webhookSubscription.create.mockResolvedValue({
      id: 'sub_1',
      url,
      eventTypes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const { default: webhookService } = await import('../services/webhookService.js');
    const result = await webhookService.createSubscription({ url, eventTypes, createdBy: '0xABC' });

    expect(result).toMatchObject({ id: 'sub_1', url, eventTypes });
    expect(result.secret).toEqual(expect.any(String));
    expect(result.secret.length).toBeGreaterThan(0);
    expect(prismaMock.webhookSubscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          url,
          eventTypes,
          createdBy: '0xABC',
          isActive: true,
        }),
      }),
    );
  });

  it('queues webhook deliveries for matching subscriptions', async () => {
    const subscription = { id: 'sub_1', url: 'https://example.com/webhook', secret: 'secret123' };
    prismaMock.webhookSubscription.findMany.mockResolvedValue([subscription]);
    prismaMock.webhookDelivery.create.mockResolvedValue({ id: 'delivery_1' });
    prismaMock.webhookDelivery.update.mockResolvedValue({});
    queueMock.enqueueWebhookDelivery.mockResolvedValue({});

    const { default: webhookService } = await import('../services/webhookService.js');
    const payload = { ledger: '100' };
    const result = await webhookService.queueEventWebhooks('esc_crt', payload);

    expect(result).toEqual({
      queued: 1,
      deliveries: [{ subscriptionId: 'sub_1', deliveryId: 'delivery_1' }],
    });
    expect(prismaMock.webhookDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscription: { connect: { id: 'sub_1' } },
          eventType: 'esc_crt',
          payload,
          status: 'pending',
        }),
      }),
    );
    expect(queueMock.enqueueWebhookDelivery).toHaveBeenCalledWith(
      'delivery_1',
      'https://example.com/webhook',
      expect.objectContaining({ eventType: 'esc_crt', deliveryId: 'delivery_1' }),
      expect.objectContaining({ 'X-Webhook-Signature': expect.any(String) }),
      expect.objectContaining({ attempts: 5 }),
    );
  });

  it('processWebhookJob records successful deliveries', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: jest.fn() });
    prismaMock.webhookDelivery.update.mockResolvedValue({});

    const { processWebhookJob } = await import('../workers/webhookWorker.js');
    const job = {
      data: {
        deliveryId: 'delivery_1',
        url: 'https://example.com/webhook',
        payload: { eventType: 'esc_crt' },
        headers: { 'X-Webhook-Signature': 'sig' },
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    };

    await expect(processWebhookJob(job)).resolves.toBeUndefined();
    expect(prismaMock.webhookDelivery.update).toHaveBeenCalledWith({
      where: { id: 'delivery_1' },
      data: expect.objectContaining({ status: 'success', responseCode: 200, attempts: 1 }),
    });
  });

  it('processWebhookJob marks failed delivery after final retry', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network error'));
    prismaMock.webhookDelivery.update.mockResolvedValue({});

    const { processWebhookJob } = await import('../workers/webhookWorker.js');
    const job = {
      data: {
        deliveryId: 'delivery_1',
        url: 'https://example.com/webhook',
        payload: { eventType: 'esc_crt' },
        headers: { 'X-Webhook-Signature': 'sig' },
      },
      attemptsMade: 2,
      opts: { attempts: 3 },
    };

    await expect(processWebhookJob(job)).rejects.toThrow('network error');
    expect(prismaMock.webhookDelivery.update).toHaveBeenCalledWith({
      where: { id: 'delivery_1' },
      data: expect.objectContaining({
        status: 'failed',
        attempts: 3,
        errorMessage: expect.stringContaining('network error'),
      }),
    });
  });
});
