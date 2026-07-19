import { jest } from '@jest/globals';

const mockSendMail = jest.fn();
jest.unstable_mockModule('nodemailer', () => ({
  default: {
    createTransport: jest.fn(() => ({
      sendMail: mockSendMail
    }))
  }
}));

const mockSgSend = jest.fn();
jest.unstable_mockModule('@sendgrid/mail', () => ({
  default: {
    setApiKey: jest.fn(),
    send: mockSgSend
  }
}));

const mockMgCreate = jest.fn();
jest.unstable_mockModule('mailgun.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    client: jest.fn(() => ({
      messages: {
        create: mockMgCreate
      }
    }))
  }))
}));

process.env.EMAIL_PROVIDER = 'smtp';
process.env.SENDGRID_API_KEY = 'test_key';
process.env.MAILGUN_API_KEY = 'test_key';
process.env.MAILGUN_DOMAIN = 'test.com';

const { deliverEmail } = await import('../../services/emailProviders.js');

describe('notificationDispatch Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('falls back to sendgrid if smtp fails', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP connection timeout'));
    mockSgSend.mockResolvedValueOnce([{ headers: { 'x-message-id': 'sg-123' } }]);

    const result = await deliverEmail({ to: 'test@example.com', subject: 'Test', html: '<p>Hi</p>', text: 'Hi' });

    expect(mockSendMail).toHaveBeenCalled();
    expect(mockSgSend).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('sg-123');
  });

  it('marks as failed if all 3 providers fail', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP fail'));
    mockSgSend.mockRejectedValueOnce(new Error('Sendgrid fail'));
    mockMgCreate.mockRejectedValueOnce(new Error('Mailgun fail'));

    const result = await deliverEmail({ to: 'test@example.com', subject: 'Test', html: '<p>Hi</p>', text: 'Hi' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Mailgun fail');
  });
});
