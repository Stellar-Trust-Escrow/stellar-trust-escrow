import { jest } from '@jest/globals';

const mkdirMock = jest.fn();
const readFileMock = jest.fn();
const writeFileMock = jest.fn();

jest.unstable_mockModule('fs/promises', () => ({
  mkdir: mkdirMock,
  readFile: readFileMock,
  writeFile: writeFileMock,
}));

const {
  __resetForTests,
  buildUnsubscribeUrl,
  getPreference,
  getQueueSnapshot,
  notifyEscrowStatusChange,
  resubscribe,
  unsubscribe,
} = await import('../services/emailService.js');

beforeEach(() => {
  jest.clearAllMocks();
  mkdirMock.mockResolvedValue(undefined);
  writeFileMock.mockResolvedValue(undefined);
  readFileMock.mockRejectedValue({ code: 'ENOENT' });
  __resetForTests();
});

describe('emailService', () => {
  it('queues an escrow status email with text and html bodies', async () => {
    const result = await notifyEscrowStatusChange({
      escrowId: 42,
      previousStatus: 'Active',
      status: 'Completed',
      dashboardUrl: 'http://localhost:4000/escrows/42',
      recipients: [{ email: 'client@example.com', name: 'Client' }],
    });

    const snapshot = await getQueueSnapshot();
    expect(result.queued).toBe(1);
    expect(snapshot.queue[0].message.subject).toContain('Escrow #42');
    expect(snapshot.queue[0].message.text).toContain('Completed');
    expect(snapshot.queue[0].message.html).toContain('Open escrow details');
  });

  it('skips queueing when a recipient has unsubscribed', async () => {
    const preference = await getPreference('freelancer@example.com');
    await unsubscribe(preference.email, preference.unsubscribeToken, 'manual_test');

    const result = await notifyEscrowStatusChange({
      escrowId: 12,
      previousStatus: 'Active',
      status: 'Disputed',
      dashboardUrl: 'http://localhost:4000/escrows/12',
      recipients: [{ email: preference.email }],
    });

    expect(result.queued).toBe(0);
    expect(result.skipped).toEqual([{ email: preference.email, reason: 'unsubscribed' }]);
  });

  it('restores delivery eligibility when a user resubscribes', async () => {
    const preference = await getPreference('user@example.com');
    await unsubscribe(preference.email, preference.unsubscribeToken, 'manual_test');
    await resubscribe(preference.email);

    const updated = await getPreference(preference.email);
    expect(updated.unsubscribedAt).toBeNull();
    expect(buildUnsubscribeUrl(updated.email, updated.unsubscribeToken)).toContain(
      encodeURIComponent(updated.email),
    );
  });
});
