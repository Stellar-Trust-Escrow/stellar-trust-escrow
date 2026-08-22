import { describe, test, expect, jest } from '@jest/globals';

jest.unstable_mockModule('../services/ipfsService.js', () => ({
  default: {
    pinFile: jest.fn().mockResolvedValue('QmMockCID1234567890abcd'),
    fetchBuffer: jest.fn().mockResolvedValue(Buffer.from('')),
  },
}));

jest.unstable_mockModule('../config/logger.js', () => ({
  createModuleLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const svc = await import('../services/documentService.js');

describe('documentService', () => {
  test('uploadDocument returns cid and AES-256-GCM metadata', async () => {
    const result = await svc.uploadDocument({
      file: Buffer.from('hello escrow document'),
      fileName: 'terms.pdf',
      mimeType: 'application/pdf',
      escrowId: 'esc-test-1',
    });
    expect(result).toHaveProperty('cid');
    expect(result).toHaveProperty('encryptionKey');
    expect(result).toHaveProperty('iv');
    expect(result).toHaveProperty('authTag');
    expect(result.encryptionKey).toHaveLength(64);
    expect(result.iv).toHaveLength(24);
    expect(result.authTag).toHaveLength(32);
    expect(result.size).toBe(21);
  });

  test('uploadDocument rejects files over 10MB', async () => {
    const big = Buffer.alloc(11 * 1024 * 1024, 0);
    await expect(
      svc.uploadDocument({ file: big, fileName: 'huge.pdf', mimeType: 'application/pdf', escrowId: 'esc-big' })
    ).rejects.toThrow('10MB');
  });

  test('getEscrowDocuments returns metadata for uploaded docs', async () => {
    await svc.uploadDocument({
      file: Buffer.from('doc-content'),
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      escrowId: 'esc-list-test',
    });
    const docs = svc.getEscrowDocuments('esc-list-test');
    expect(docs.length).toBeGreaterThan(0);
    expect(docs[0]).toHaveProperty('cid');
    expect(docs[0]).toHaveProperty('fileName', 'report.pdf');
    expect(docs[0]).toHaveProperty('uploadedAt');
  });

  test('getEscrowDocuments returns empty array for unknown escrow', () => {
    expect(svc.getEscrowDocuments('non-existent-escrow')).toEqual([]);
  });
});
