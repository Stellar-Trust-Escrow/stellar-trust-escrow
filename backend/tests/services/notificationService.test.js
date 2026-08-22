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

const { renderTemplate } = await import('../../services/notificationService.js');

describe('notificationService', () => {
  describe('renderTemplate', () => {
    it('is a function', () => {
      expect(typeof renderTemplate).toBe('function');
    });

    it('returns a string or falsy for known template type', () => {
      const result = renderTemplate('escrow_created', { escrowId: '123', amount: '100' });
      expect(typeof result === 'string' || result == null).toBe(true);
    });
  });
});
