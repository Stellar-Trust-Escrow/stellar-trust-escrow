import crypto from 'crypto';
import { jest } from '@jest/globals';

process.env.WEBHOOK_ENCRYPTION_KEY = '1'.repeat(64);

const prismaMock = {
  webhookEndpoint: {
    create: jest.fn(),
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  webhookDelivery: {
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
};

const queueMock = {
  enqueueWebhookDelivery: jest.fn(),
};

jest.unstable_mockModule('../../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('../../queues/webhookQueue.js', () => ({
  enqueueWebhookDelivery: queueMock.enqueueWebhookDelivery,
}));

const webhookService = await import('../../services/webhookService.js');
const { processWebhookJob } = await import('../../workers/webhookWorker.js');

describe('webhookService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queueMock.enqueueWebhookDelivery.mockResolvedValue({});
  });

  it('verifies HMAC signature with crypto.timingSafeEqual on the receiving end', () => {
    const secret = 'whsec_test';
    const payload = {
      eventType: 'esc_crt',
      deliveryId: 'del_1',
      timestamp: '2026-07-17T00:00:00.000Z',
      data: { escrowId: '42' },
    };

    const signature = webhookService.signPayload(secret, payload);
    expect(webhookService.verifySignature(secret, payload, signature)).toBe(true);
    expect(webhookService.verifySignature(secret, payload, 'sha256=deadbeef')).toBe(false);
  });

  it('uses retry backoff delays of 30s, 60s, 120s, 240s, and 480s for attempts 1 through 5', () => {
    expect(webhookService.calculateRetryDelayMs(1)).toBe(30_000);
    expect(webhookService.calculateRetryDelayMs(2)).toBe(60_000);
    expect(webhookService.calculateRetryDelayMs(3)).toBe(120_000);
    expect(webhookService.calculateRetryDelayMs(4)).toBe(240_000);
    expect(webhookService.calculateRetryDelayMs(5)).toBe(480_000);
  });

  it('marks a delivery delivered on 2xx responses', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue('ok'),
    });
    prismaMock.webhookDelivery.update.mockResolvedValue({});

    await expect(
      processWebhookJob({
        data: {
          deliveryId: 'delivery_1',
          url: 'https://example.com/hook',
          payload: { eventType: 'esc_crt' },
          headers: { 'X-Trustchain-Signature': 'sha256=abc' },
        },
        attemptsMade: 0,
        opts: { attempts: 5 },
      }),
    ).resolves.toBeUndefined();

    expect(prismaMock.webhookDelivery.update).toHaveBeenCalledWith({
      where: { id: 'delivery_1' },
      data: expect.objectContaining({
        status: 'delivered',
        responseCode: 200,
        responseBody: 'ok',
        attempts: 1,
        nextRetryAt: null,
      }),
    });
  });

  it('increments attempts on non-2xx responses and schedules retry before the dead threshold', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: jest.fn().mockResolvedValue('unavailable'),
    });
    prismaMock.webhookDelivery.update.mockResolvedValue({
      id: 'delivery_1',
      endpointId: 'endpoint_1',
      eventType: 'esc_crt',
      attempts: 2,
    });

    await expect(
      processWebhookJob({
        data: {
          deliveryId: 'delivery_1',
          url: 'https://example.com/hook',
          payload: { eventType: 'esc_crt' },
          headers: {},
        },
        attemptsMade: 1,
        opts: { attempts: 5 },
      }),
    ).rejects.toThrow('Webhook failed: 503');

    expect(prismaMock.webhookDelivery.update).toHaveBeenCalledWith({
      where: { id: 'delivery_1' },
      data: expect.objectContaining({
        status: 'failed',
        responseCode: 503,
        responseBody: 'unavailable',
        attempts: 2,
        nextRetryAt: expect.any(Date),
      }),
    });
  });

  it('marks a delivery dead after 5 failed attempts and emits webhook.dead', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValue('error'),
    });
    const deadDelivery = {
      id: 'delivery_1',
      endpointId: 'endpoint_1',
      eventType: 'esc_crt',
      attempts: 5,
    };
    prismaMock.webhookDelivery.update.mockResolvedValue(deadDelivery);

    const deadListener = jest.fn();
    webhookService.webhookEvents.on('webhook.dead', deadListener);

    await expect(
      processWebhookJob({
        data: {
          deliveryId: 'delivery_1',
          url: 'https://example.com/hook',
          payload: { eventType: 'esc_crt' },
          headers: {},
        },
        attemptsMade: 4,
        opts: { attempts: 5 },
      }),
    ).resolves.toBeUndefined();

    expect(prismaMock.webhookDelivery.update).toHaveBeenCalledWith({
      where: { id: 'delivery_1' },
      data: expect.objectContaining({
        status: 'dead',
        attempts: 5,
        nextRetryAt: null,
      }),
    });
    expect(deadListener).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryId: 'delivery_1',
        endpointId: 'endpoint_1',
        eventType: 'esc_crt',
        attempts: 5,
      }),
    );

    webhookService.webhookEvents.off('webhook.dead', deadListener);
  });

  it('does not schedule further retries after a delivery is marked dead', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValue('error'),
    });
    prismaMock.webhookDelivery.update.mockResolvedValue({
      id: 'delivery_1',
      endpointId: 'endpoint_1',
      eventType: 'esc_crt',
      attempts: 5,
    });

    await processWebhookJob({
      data: {
        deliveryId: 'delivery_1',
        url: 'https://example.com/hook',
        payload: { eventType: 'esc_crt' },
        headers: {},
      },
      attemptsMade: 4,
      opts: { attempts: 5 },
    });

    expect(queueMock.enqueueWebhookDelivery).not.toHaveBeenCalled();
    expect(prismaMock.webhookDelivery.update).toHaveBeenCalledWith({
      where: { id: 'delivery_1' },
      data: expect.objectContaining({
        status: 'dead',
        nextRetryAt: null,
      }),
    });
  });

  it('creates an endpoint, queues an escrow event, and stores a signed delivery payload', async () => {
    const plainSecret = crypto.randomBytes(32).toString('hex');
    const encryptedSecret = webhookService.encryptSecret(plainSecret);
    const endpoint = {
      id: 'endpoint_1',
      url: 'https://example.com/hook',
      secret: encryptedSecret,
      events: ['esc_crt'],
      active: true,
    };

    prismaMock.webhookEndpoint.findMany.mockResolvedValue([endpoint]);
    prismaMock.webhookDelivery.create.mockResolvedValue({ id: 'delivery_1' });
    prismaMock.webhookDelivery.update.mockResolvedValue({});

    const escrowPayload = {
      eventType: 'esc_crt',
      ledger: '100',
      escrowId: '42',
    };

    const result = await webhookService.default.queueEventWebhooks('esc_crt', escrowPayload);

    expect(result).toEqual({
      queued: 1,
      deliveries: [{ endpointId: 'endpoint_1', deliveryId: 'delivery_1' }],
    });

    expect(prismaMock.webhookDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          endpointId: 'endpoint_1',
          eventType: 'esc_crt',
          payload: escrowPayload,
          status: 'pending',
        }),
      }),
    );

    const enqueueCall = queueMock.enqueueWebhookDelivery.mock.calls[0][0];
    expect(enqueueCall.headers['X-Trustchain-Event']).toBe('esc_crt');
    expect(enqueueCall.headers['X-Delivery-Id']).toBe('delivery_1');
    expect(
      webhookService.verifySignature(
        plainSecret,
        enqueueCall.payload,
        enqueueCall.headers['X-Trustchain-Signature'],
      ),
    ).toBe(true);
  });
});
