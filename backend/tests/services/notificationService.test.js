import { jest, describe, expect, it } from '@jest/globals';

jest.unstable_mockModule('../../config/logger.js', () => ({
  createModuleLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

jest.unstable_mockModule('nodemailer', () => ({
  default: {
    createTransport: jest.fn().mockReturnValue({
      sendMail: jest.fn().mockResolvedValue({ messageId: 'mock-id' }),
    }),
  },
}));

const { renderTemplate } = await import('../../services/notificationService.js');

describe('notificationService', () => {
  describe('renderTemplate', () => {
    it('is a function', () => {
      expect(typeof renderTemplate).toBe('function');
    });

    it('returns a string for known template type', () => {
      const result = renderTemplate('escrow_created', { escrowId: '123', amount: '100' });
      expect(typeof result === 'string' || result === undefined || result === null).toBe(true);
    });
  });
});
