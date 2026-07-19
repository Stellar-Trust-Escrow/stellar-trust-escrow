import { jest } from '@jest/globals';

jest.unstable_mockModule('../../queues/emailQueue.js', () => ({
  notificationsQueue: {
    add: jest.fn().mockResolvedValue({ id: 'job-123' })
  }
}));

const mockPrisma = {
  user: {
    findUnique: jest.fn()
  },
  notificationDelivery: {
    create: jest.fn()
  }
};

jest.unstable_mockModule('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma)
}));

// Dynamic import after mocks
const { renderTemplate, sendNotification } = await import('../../services/notificationService.js');
const { notificationsQueue } = await import('../../queues/emailQueue.js');
const { PrismaClient } = await import('@prisma/client');

const prisma = new PrismaClient();

describe('notificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('renderTemplate', () => {
    it('compiles handlebars template successfully', async () => {
      const { subject, body } = await renderTemplate('escrow_funded', 'email', { name: 'Alice', amount: '100 XLM' }, 'en');
      expect(subject).toBe('Escrow Funded');
      expect(body).toContain('Hi Alice');
      expect(body).toContain('100 XLM');
    });

    it('falls back to english locale if locale not found', async () => {
      const { subject, body } = await renderTemplate('escrow_funded', 'email', { name: 'Bob', amount: '50 XLM' }, 'de');
      expect(subject).toBe('Escrow Funded'); 
      expect(body).toContain('Bob');
    });
  });

  describe('sendNotification validation', () => {
    it('throws error for invalid channel', async () => {
      await expect(sendNotification({ userId: 1, channel: 'push', template: 'test', data: {} })).rejects.toThrow('Invalid channel: push');
    });

    it('throws 400 error for unknown template', async () => {
      try {
        await sendNotification({ userId: 1, channel: 'email', template: 'unknown_tpl', data: {} });
        fail('should have thrown');
      } catch (err) {
        expect(err.status).toBe(400);
      }
    });

    it('throws error if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(sendNotification({ userId: 99, channel: 'email', template: 'escrow_funded', data: {} })).rejects.toThrow('User not found: 99');
    });

    it('returns null if user opted out of channel', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, notificationPreferences: { email: false } });
      const res = await sendNotification({ userId: 1, channel: 'email', template: 'escrow_funded', data: {} });
      expect(res).toBeNull();
      expect(notificationsQueue.add).not.toHaveBeenCalled();
    });

    it('throws 400 if SMS to invalid phone format', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, notificationPreferences: { sms: true } });
      try {
        await sendNotification({ userId: 1, channel: 'sms', template: 'escrow_funded', data: { phone: '123' } });
        fail('should have thrown');
      } catch (err) {
        expect(err.status).toBe(400);
      }
    });

    it('enqueues job successfully', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, notificationPreferences: { email: true } });
      mockPrisma.notificationDelivery.create.mockResolvedValue({ id: 'del-123' });
      const jobId = await sendNotification({ userId: 1, channel: 'email', template: 'escrow_funded', data: {} });
      
      expect(mockPrisma.notificationDelivery.create).toHaveBeenCalled();
      expect(notificationsQueue.add).toHaveBeenCalled();
      expect(jobId).toBe('job-123');
    });
  });
});
