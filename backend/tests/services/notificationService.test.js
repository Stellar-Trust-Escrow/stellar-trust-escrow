import { jest, describe, expect, it } from '@jest/globals';

jest.unstable_mockModule('../../config/logger.js', () => ({
  createModuleLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule('nodemailer', () => ({
  default: {
    createTransport: jest.fn().mockReturnValue({
      sendMail: jest.fn().mockResolvedValue({ messageId: 'mock-id' }),
    }),
  },
}));

jest.unstable_mockModule('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: jest.fn() })),
  Worker: jest.fn(),
}));

jest.unstable_mockModule('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({})),
}));

jest.unstable_mockModule('../../queues/emailQueue.js', () => ({
  notificationsQueue: { add: jest.fn() },
}));

const { renderTemplate } = await import('../../services/notificationService.js');

describe('notificationService', () => {
  describe('renderTemplate', () => {
    it('is a function', () => {
      expect(typeof renderTemplate).toBe('function');
    });

    it('renders an existing email template with subject and body', async () => {
      const result = await renderTemplate('escrow_funded', 'email', { name: 'Alice', amount: '100 XLM' });
      expect(result).toHaveProperty('subject');
      expect(result).toHaveProperty('body');
      expect(result.subject).toContain('Escrow Funded');
      expect(result.body).toContain('Alice');
    });

    it('renders an existing sms template with only body', async () => {
      const result = await renderTemplate('escrow_funded', 'sms', { name: 'Bob', amount: '50 XLM' });
      expect(result).toHaveProperty('body');
      expect(result.subject).toBeNull();
    });

    it('throws for a nonexistent template', async () => {
      await expect(renderTemplate('nonexistent_template', 'email', {})).rejects.toThrow();
    });
  });
});
