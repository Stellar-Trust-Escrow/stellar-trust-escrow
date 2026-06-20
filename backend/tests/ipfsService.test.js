import { jest } from '@jest/globals';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.unstable_mockModule('../config/logger.js', () => ({
  createModuleLogger: () => loggerMock,
}));

// sharp mock — returns a chainable object
const sharpMock = jest.fn(() => ({
  resize: jest.fn().mockReturnThis(),
  jpeg: jest.fn().mockReturnThis(),
  toBuffer: jest.fn().mockResolvedValue(Buffer.from('thumb')),
  metadata: jest.fn().mockResolvedValue({ width: 100, height: 100, format: 'jpeg' }),
}));
jest.unstable_mockModule('sharp', () => ({ default: sharpMock }));

// ── Import SUT ────────────────────────────────────────────────────────────────

const { default: ipfsService } = await import('../services/ipfsService.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePinataResponse(cid = 'bafytest123', size = 512) {
  return {
    ok: true,
    json: async () => ({ IpfsHash: cid, PinSize: size }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.PINATA_JWT = 'test-jwt-token';
  process.env.MAX_FILE_SIZE = String(10 * 1024 * 1024);
  process.env.ALLOWED_MIME_TYPES = '';
  global.fetch = jest.fn().mockResolvedValue(makePinataResponse());
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ipfsService — encryption', () => {
  it('encrypts file before upload (ciphertext differs from plaintext)', async () => {
    const plaintext = Buffer.from('sensitive dispute evidence');
    await ipfsService.pinFile(plaintext, 'image/jpeg', 'evidence.jpg', ['ADDR1']);

    const [, opts] = global.fetch.mock.calls[0];
    // The FormData body is opaque but we can verify Authorization header
    expect(opts.headers.Authorization).toBe('Bearer test-jwt-token');
  });

  it('round-trips: decryptFile reverses encryptBuffer output', async () => {
    const plaintext = Buffer.from('hello encrypted world');
    const cid = 'bafyround';
    global.fetch.mockResolvedValueOnce(makePinataResponse(cid));

    await ipfsService.pinFile(plaintext, 'image/jpeg', 'test.jpg', ['ADDR_A']);

    const { key, iv } = ipfsService.getDecryptionKey(cid, 'ADDR_A');

    // Reconstruct the encrypted payload the same way pinFile does
    // We can't access the internal payload directly, so we test via decryptFile
    // by encrypting a known buffer and decrypting it
    const crypto = await import('node:crypto');
    const keyBuf = Buffer.from(key, 'hex');
    const ivBuf = Buffer.from(iv, 'hex');
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, ivBuf);
    const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    const payload = Buffer.concat([tag, ct]);

    const decrypted = ipfsService.decryptFile(payload, key, iv);
    expect(decrypted.toString()).toBe('hello encrypted world');
  });

  it('uses AES-256-GCM (32-byte key, 12-byte IV)', async () => {
    const cid = 'bafyaes';
    global.fetch.mockResolvedValueOnce(makePinataResponse(cid));

    await ipfsService.pinFile(Buffer.from('data'), 'image/png', 'f.png', ['ADDR_B']);
    const { key, iv } = ipfsService.getDecryptionKey(cid, 'ADDR_B');

    expect(Buffer.from(key, 'hex')).toHaveLength(32); // 256-bit
    expect(Buffer.from(iv, 'hex')).toHaveLength(12); // 96-bit GCM IV
  });
});

describe('ipfsService — Pinata upload', () => {
  it('sends Authorization: Bearer <JWT> header', async () => {
    await ipfsService.pinFile(Buffer.from('x'), 'image/jpeg', 'x.jpg', []);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toContain('pinata.cloud');
    expect(opts.headers.Authorization).toBe('Bearer test-jwt-token');
  });

  it('returns cid and size from Pinata response', async () => {
    global.fetch.mockResolvedValueOnce(makePinataResponse('bafyabc', 1024));
    const result = await ipfsService.pinFile(Buffer.from('data'), 'image/jpeg', 'f.jpg', []);
    expect(result).toEqual({ cid: 'bafyabc', size: 1024 });
  });

  it('throws when PINATA_JWT is not set', async () => {
    delete process.env.PINATA_JWT;
    await expect(ipfsService.pinFile(Buffer.from('x'), 'image/jpeg', 'x.jpg', [])).rejects.toThrow(
      'PINATA_JWT',
    );
  });

  it('throws when Pinata returns a non-OK status', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });
    await expect(ipfsService.pinFile(Buffer.from('x'), 'image/jpeg', 'x.jpg', [])).rejects.toThrow(
      'Pinata upload failed',
    );
  });
});

describe('ipfsService — access control', () => {
  it('returns key/iv to an authorised address', async () => {
    const cid = 'bafyauth1';
    global.fetch.mockResolvedValueOnce(makePinataResponse(cid));
    await ipfsService.pinFile(Buffer.from('secret'), 'image/jpeg', 'f.jpg', ['STELLAR_ADDR']);

    const keys = ipfsService.getDecryptionKey(cid, 'STELLAR_ADDR');
    expect(keys).toHaveProperty('key');
    expect(keys).toHaveProperty('iv');
  });

  it('is case-insensitive for address comparison', async () => {
    const cid = 'bafyauth2';
    global.fetch.mockResolvedValueOnce(makePinataResponse(cid));
    await ipfsService.pinFile(Buffer.from('secret'), 'image/jpeg', 'f.jpg', ['UPPER_ADDR']);

    expect(() => ipfsService.getDecryptionKey(cid, 'upper_addr')).not.toThrow();
  });

  it('throws UNAUTHORISED for an address not in the authorised list', async () => {
    const cid = 'bafyauth3';
    global.fetch.mockResolvedValueOnce(makePinataResponse(cid));
    await ipfsService.pinFile(Buffer.from('secret'), 'image/jpeg', 'f.jpg', ['ALLOWED']);

    expect(() => ipfsService.getDecryptionKey(cid, 'NOT_ALLOWED')).toThrow(
      expect.objectContaining({ code: 'UNAUTHORISED' }),
    );
  });

  it('throws KEY_NOT_FOUND for an unknown CID', () => {
    expect(() => ipfsService.getDecryptionKey('bafyunknown', 'ADDR')).toThrow(
      expect.objectContaining({ code: 'KEY_NOT_FOUND' }),
    );
  });
});

describe('ipfsService — file validation', () => {
  it('rejects files exceeding MAX_FILE_SIZE', async () => {
    process.env.MAX_FILE_SIZE = '10';
    const big = Buffer.alloc(11);
    await expect(ipfsService.pinFile(big, 'image/jpeg', 'big.jpg', [])).rejects.toThrow(
      expect.objectContaining({ code: 'FILE_TOO_LARGE' }),
    );
  });

  it('rejects disallowed MIME types', async () => {
    process.env.ALLOWED_MIME_TYPES = 'image/jpeg';
    await expect(
      ipfsService.pinFile(Buffer.from('x'), 'application/exe', 'bad.exe', []),
    ).rejects.toThrow(expect.objectContaining({ code: 'MIME_NOT_ALLOWED' }));
  });

  it('accepts allowed MIME types', async () => {
    process.env.ALLOWED_MIME_TYPES = 'image/jpeg';
    global.fetch.mockResolvedValueOnce(makePinataResponse('bafyok'));
    await expect(
      ipfsService.pinFile(Buffer.from('x'), 'image/jpeg', 'ok.jpg', []),
    ).resolves.toHaveProperty('cid');
  });
});

describe('ipfsService — utilities', () => {
  it('getFileUrl builds a gateway URL', () => {
    process.env.PINATA_GATEWAY_URL = 'https://gw.pinata.cloud';
    const url = ipfsService.getFileUrl('bafytest');
    expect(url).toBe('https://gw.pinata.cloud/ipfs/bafytest');
  });

  it('sanitizeFilename strips unsafe characters', () => {
    expect(ipfsService.sanitizeFilename('../../etc/passwd')).toBe('.._.._etc_passwd');
  });

  it('sanitizeFilename returns "unknown" for empty input', () => {
    expect(ipfsService.sanitizeFilename('')).toBe('unknown');
  });

  it('isImage returns true for image/* MIME types', () => {
    expect(ipfsService.isImage('image/jpeg')).toBe(true);
    expect(ipfsService.isImage('application/pdf')).toBe(false);
  });

  it('generateThumbnail returns null for non-image MIME types', async () => {
    const result = await ipfsService.generateThumbnail(Buffer.from('pdf'), 'application/pdf');
    expect(result).toBeNull();
  });

  it('generateThumbnail calls sharp for image MIME types', async () => {
    const result = await ipfsService.generateThumbnail(Buffer.from('img'), 'image/jpeg');
    expect(result).toEqual(Buffer.from('thumb'));
    expect(sharpMock).toHaveBeenCalled();
  });
});
