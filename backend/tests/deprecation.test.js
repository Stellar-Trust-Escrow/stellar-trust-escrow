/**
 * Tests for API Deprecation Middleware
 */

import { jest } from '@jest/globals';

// Set up environment before imports
process.env.API_DOCS_URL = '/docs';

import {
  deprecate,
  deprecateVersion,
  enforceSunset,
  addDeprecationToResponse,
  createDeprecationNotice,
  deprecationPresets,
} from '../api/middleware/deprecation.js';

describe('Deprecation Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      path: '/api/test',
      method: 'GET',
      get: jest.fn((header) => {
        if (header === 'user-agent') return 'TestClient/1.0';
        return null;
      }),
      ip: '127.0.0.1',
    };

    res = {
      setHeader: jest.fn(),
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };

    next = jest.fn();

    // Mock console.warn to avoid noise in tests
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('deprecate()', () => {
    it('should set all required deprecation headers', () => {
      const config = {
        version: 'v1',
        sunsetDate: new Date('2026-12-31T23:59:59Z'),
        replacement: '/api/v2/test',
        message: 'Test deprecation',
      };

      const middleware = deprecate(config);
      middleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('Deprecation', 'true');
      expect(res.setHeader).toHaveBeenCalledWith('Sunset', config.sunsetDate.toUTCString());
      expect(res.setHeader).toHaveBeenCalledWith('X-API-Deprecated', 'true');
      expect(res.setHeader).toHaveBeenCalledWith('X-API-Deprecated-Version', 'v1');
      expect(res.setHeader).toHaveBeenCalledWith('X-API-Replacement', '/api/v2/test');
      expect(next).toHaveBeenCalled();
    });

    it('should set Warning header with correct format', () => {
      const config = {
        version: 'v1',
        sunsetDate: new Date('2026-12-31'),
        replacement: '/api/v2/test',
      };

      const middleware = deprecate(config);
      middleware(req, res, next);

      const warningCall = res.setHeader.mock.calls.find((call) => call[0] === 'Warning');
      expect(warningCall).toBeDefined();
      expect(warningCall[1]).toContain('299');
      expect(warningCall[1]).toContain('v1');
      expect(warningCall[1]).toContain('/api/v2/test');
    });

    it('should set Link header for documentation', () => {
      const config = {
        version: 'v1',
        sunsetDate: new Date('2026-12-31'),
        documentationUrl: 'https://docs.example.com',
      };

      const middleware = deprecate(config);
      middleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Link',
        '<https://docs.example.com>; rel="deprecation"; type="text/html"',
      );
    });

    it('should log deprecation usage', () => {
      const config = {
        version: 'v1',
        sunsetDate: new Date('2026-12-31'),
      };

      const middleware = deprecate(config);
      middleware(req, res, next);

      expect(console.warn).toHaveBeenCalledWith(
        '[DEPRECATION]',
        expect.objectContaining({
          path: '/api/test',
          method: 'GET',
          version: 'v1',
        }),
      );
    });

    it('should throw error if version is missing', () => {
      expect(() => {
        deprecate({ sunsetDate: new Date('2026-12-31') });
      }).toThrow('Deprecation config must include version');
    });

    it('should throw error if sunsetDate is invalid', () => {
      expect(() => {
        deprecate({ version: 'v1', sunsetDate: 'invalid' });
      }).toThrow('Deprecation config must include valid sunsetDate');
    });
  });

  describe('deprecateVersion()', () => {
    it('should work as alias for deprecate', () => {
      const config = {
        version: 'v1',
        sunsetDate: new Date('2026-12-31'),
      };

      const middleware = deprecateVersion(config);
      middleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('Deprecation', 'true');
      expect(next).toHaveBeenCalled();
    });
  });

  describe('enforceSunset()', () => {
    it('should return 410 Gone if sunset date has passed', () => {
      const pastDate = new Date('2020-01-01');
      const middleware = enforceSunset(pastDate);

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(410);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Gone',
          message: expect.stringContaining('sunset'),
        }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next() if sunset date has not passed', () => {
      const futureDate = new Date('2030-12-31');
      const middleware = enforceSunset(futureDate);

      middleware(req, res, next);

      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('should throw error if sunsetDate is invalid', () => {
      expect(() => {
        enforceSunset('invalid');
      }).toThrow('enforceSunset requires a valid Date object');
    });
  });

  describe('addDeprecationToResponse()', () => {
    it('should inject deprecation notice into JSON response', () => {
      const config = {
        version: 'v1',
        sunsetDate: new Date('2026-12-31'),
        replacement: '/api/v2/test',
      };

      const originalJson = res.json;
      const middleware = addDeprecationToResponse(config);
      middleware(req, res, next);

      // Simulate controller calling res.json()
      const testData = { users: [{ id: 1 }] };
      res.json(testData);

      expect(originalJson).toHaveBeenCalled();
      const callArg = originalJson.mock.calls[0][0];
      expect(callArg).toHaveProperty('_deprecation');
      expect(callArg._deprecation).toHaveProperty('deprecated', true);
      expect(callArg._deprecation).toHaveProperty('version', 'v1');
      expect(callArg.users).toEqual([{ id: 1 }]);
    });
  });

  describe('createDeprecationNotice()', () => {
    it('should create proper deprecation notice object', () => {
      const config = {
        version: 'v1',
        sunsetDate: new Date('2026-12-31'),
        replacement: '/api/v2/test',
        message: 'Test message',
      };

      const notice = createDeprecationNotice(config);

      expect(notice).toEqual({
        deprecated: true,
        version: 'v1',
        sunsetDate: expect.any(String),
        daysUntilSunset: expect.any(Number),
        message: 'Test message',
        replacement: '/api/v2/test',
        documentation: expect.any(String),
        migrationGuide: expect.any(String),
      });
    });

    it('should calculate days until sunset correctly', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30); // 30 days from now

      const notice = createDeprecationNotice({
        version: 'v1',
        sunsetDate: futureDate,
      });

      expect(notice.daysUntilSunset).toBeGreaterThanOrEqual(29);
      expect(notice.daysUntilSunset).toBeLessThanOrEqual(31);
    });
  });

  describe('deprecationPresets', () => {
    it('should have legacyUnversioned preset', () => {
      expect(deprecationPresets.legacyUnversioned).toBeDefined();
      expect(deprecationPresets.legacyUnversioned.version).toBe('unversioned');
      expect(deprecationPresets.legacyUnversioned.sunsetDate).toBeInstanceOf(Date);
      expect(deprecationPresets.legacyUnversioned.replacement).toBe('/api/v1');
    });

    it('should have v1 preset', () => {
      expect(deprecationPresets.v1).toBeDefined();
      expect(deprecationPresets.v1.version).toBe('v1');
      expect(deprecationPresets.v1.sunsetDate).toBeInstanceOf(Date);
      expect(deprecationPresets.v1.replacement).toBe('/api/v2');
    });
  });
});
