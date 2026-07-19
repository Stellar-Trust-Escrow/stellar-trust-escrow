import { randomUUID } from 'crypto';
import cache from '../../lib/cache.js';
import keyRotationService from '../../services/keyRotationService.js';
import { getLogger } from '../../config/logger.js';

jest.mock('../../lib/cache.js', () => ({
  get: jest.fn(),
  set: jest.fn(),
  invalidate: jest.fn(),
}));

describe('Key Rotation Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCurrentSigningKey', () => {
    it('should generate a new key if none exists', async () => {
      cache.get.mockResolvedValueOnce(null); // No current key
      
      const key = await keyRotationService.getCurrentSigningKey();
      
      expect(key).toBeDefined();
      expect(key.kid).toBeDefined();
      expect(key.privateKey).toContain('BEGIN PRIVATE KEY');
      expect(key.publicKey).toContain('BEGIN PUBLIC KEY');
      expect(cache.set).toHaveBeenCalledWith(
        'signing_keys:current', 
        expect.objectContaining({ kid: key.kid }), 
        expect.any(Number)
      );
    });

    it('should return existing key if it exists', async () => {
      const mockKey = { kid: '123', privateKey: 'prv', publicKey: 'pub', algorithm: 'RS256' };
      cache.get.mockResolvedValueOnce(JSON.stringify(mockKey));
      
      const key = await keyRotationService.getCurrentSigningKey();
      
      expect(key.kid).toBe('123');
      // Should not generate new
      expect(cache.set).not.toHaveBeenCalled();
    });
  });

  describe('rotateKey', () => {
    it('should move current key to archive and set new key', async () => {
      const currentKid = 'old-kid-123';
      const mockCurrent = { kid: currentKid, privateKey: 'old-prv', publicKey: 'old-pub', algorithm: 'RS256' };
      
      cache.get.mockImplementation((key) => {
        if (key === 'signing_keys:current') return JSON.stringify(mockCurrent);
        if (key === 'signing_keys:archive_kids') return JSON.stringify([]);
        return null;
      });

      const newKey = await keyRotationService.rotateKey();
      
      expect(newKey.kid).not.toBe(currentKid);
      expect(cache.set).toHaveBeenCalledWith(
        `signing_keys:archive:${currentKid}`,
        expect.objectContaining({ kid: currentKid, expiredAt: expect.any(Number) }),
        expect.any(Number)
      );
      expect(cache.set).toHaveBeenCalledWith(
        'signing_keys:current',
        expect.objectContaining({ kid: newKey.kid }),
        expect.any(Number)
      );
      expect(cache.set).toHaveBeenCalledWith(
        'signing_keys:archive_kids',
        [currentKid],
        expect.any(Number)
      );
    });
  });

  describe('pruneExpiredKeys', () => {
    it('should invalidate expired keys and update JWKS', async () => {
      const expiredKid = 'expired-kid';
      const validKid = 'valid-kid';
      
      cache.get.mockImplementation((key) => {
        if (key === 'signing_keys:archive_kids') return JSON.stringify([expiredKid, validKid]);
        if (key === `signing_keys:archive:${expiredKid}`) return JSON.stringify({ kid: expiredKid, expiredAt: Date.now() - 10000 });
        if (key === `signing_keys:archive:${validKid}`) return JSON.stringify({ kid: validKid, expiredAt: Date.now() + 10000 });
        return null;
      });

      await keyRotationService.pruneExpiredKeys();
      
      expect(cache.invalidate).toHaveBeenCalledWith(`signing_keys:archive:${expiredKid}`);
      expect(cache.set).toHaveBeenCalledWith('signing_keys:archive_kids', [validKid], expect.any(Number));
    });
  });
});
