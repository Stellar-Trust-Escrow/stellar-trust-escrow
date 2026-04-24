/**
 * Refresh Token Flow Tests
 * 
 * Comprehensive tests for JWT refresh token rotation,
 * security features, and edge cases.
 */

import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import app from '../server.js';
import tokenBlacklistService from '../services/tokenBlacklistService.js';
import tokenMetricsService from '../services/tokenMetricsService.js';

describe('Refresh Token Flow', () => {
  let testUser, tenant, tenantId, accessToken, refreshToken;

  beforeAll(async () => {
    // Set up test tenant and user
    tenantId = 'test_tenant';
    
    tenant = await prisma.tenant.create({
      data: {
        id: tenantId,
        slug: 'test-tenant',
        name: 'Test Tenant',
        status: 'active',
      },
    });

    // Create test user
    const hashedPassword = await bcrypt.hash('password123', 10);
    testUser = await prisma.user.create({
      data: {
        tenantId,
        email: 'test@example.com',
        password: hashedPassword,
      },
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.refreshToken.deleteMany({
      where: { userId: testUser.id }
    });
    await prisma.user.delete({
      where: { id: testUser.id }
    });
    await prisma.tenant.delete({
      where: { id: tenant.id }
    });
  });

  beforeEach(async () => {
    // Reset metrics before each test
    await tokenMetricsService.resetMetrics();
  });

  describe('Login and Initial Token Generation', () => {
    test('should generate access and refresh tokens on login', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('X-Tenant-ID', tenantId)
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(200);
      expect(response.body.accessToken).toBeDefined();
      expect(response.body.refreshToken).toBeDefined();
      expect(response.body.userId).toBe(testUser.id);

      accessToken = response.body.accessToken;
      refreshToken = response.body.refreshToken;

      // Verify access token structure
      const decodedAccess = jwt.decode(accessToken);
      expect(decodedAccess.type).toBe('access');
      expect(decodedAccess.userId).toBe(testUser.id);

      // Verify refresh token structure
      const decodedRefresh = jwt.decode(refreshToken);
      expect(decodedRefresh.type).toBe('refresh');
      expect(decodedRefresh.userId).toBe(testUser.id);
      expect(decodedRefresh.tokenId).toBeDefined();

      // Check refresh token was stored in database
      const tokenHash = tokenBlacklistService.hashToken(refreshToken);
      const storedToken = await prisma.refreshToken.findFirst({
        where: { tokenHash }
      });
      expect(storedToken).toBeTruthy();
      expect(storedToken.isActive).toBe(true);
    });

    test('should record metrics on token generation', async () => {
      const initialMetrics = await tokenMetricsService.getMetrics();
      
      await request(app)
        .post('/api/auth/login')
        .set('X-Tenant-ID', tenantId)
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      const finalMetrics = await tokenMetricsService.getMetrics();
      expect(finalMetrics.tokensGenerated).toBeGreaterThan(initialMetrics.tokensGenerated);
    });
  });

  describe('Token Refresh Flow', () => {
    test('should successfully rotate refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .set('X-Tenant-ID', tenantId)
        .send({ refreshToken });

      expect(response.status).toBe(200);
      expect(response.body.accessToken).toBeDefined();
      expect(response.body.refreshToken).toBeDefined();
      expect(response.body.accessToken).not.toBe(accessToken);
      expect(response.body.refreshToken).not.toBe(refreshToken);

      // Update tokens for next tests
      const newAccessToken = response.body.accessToken;
      const newRefreshToken = response.body.refreshToken;

      // Old refresh token should be blacklisted
      const isOldTokenBlacklisted = await tokenBlacklistService.isTokenBlacklisted(refreshToken, 'refresh');
      expect(isOldTokenBlacklisted).toBe(true);

      // Old token record should be inactive
      const oldTokenHash = tokenBlacklistService.hashToken(refreshToken);
      const oldTokenRecord = await prisma.refreshToken.findFirst({
        where: { tokenHash: oldTokenHash }
      });
      expect(oldTokenRecord.isActive).toBe(false);

      // New token should be active
      const newTokenHash = tokenBlacklistService.hashToken(newRefreshToken);
      const newTokenRecord = await prisma.refreshToken.findFirst({
        where: { tokenHash: newTokenHash }
      });
      expect(newTokenRecord.isActive).toBe(true);

      accessToken = newAccessToken;
      refreshToken = newRefreshToken;
    });

    test('should record metrics on successful refresh', async () => {
      const initialMetrics = await tokenMetricsService.getMetrics();
      
      await request(app)
        .post('/api/auth/refresh')
        .set('X-Tenant-ID', tenantId)
        .send({ refreshToken });

      const finalMetrics = await tokenMetricsService.getMetrics();
      expect(finalMetrics.tokensRefreshed).toBeGreaterThan(initialMetrics.tokensRefreshed);
      expect(finalMetrics.tokensGenerated).toBeGreaterThan(initialMetrics.tokensGenerated);
    });

    test('should reject blacklisted refresh tokens', async () => {
      // Blacklist the current refresh token
      await tokenBlacklistService.blacklistToken(refreshToken, 'refresh', 'test_blacklist');

      const response = await request(app)
        .post('/api/auth/refresh')
        .set('X-Tenant-ID', tenantId)
        .send({ refreshToken });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('revoked for security reasons');
    });

    test('should reject invalid refresh tokens', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .set('X-Tenant-ID', tenantId)
        .send({ refreshToken: 'invalid_token' });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Invalid or expired');
    });

    test('should reject expired refresh tokens', async () => {
      // Create an expired refresh token
      const expiredToken = jwt.sign(
        { 
          userId: testUser.id, 
          tenantId: testUser.tenantId,
          tokenId: 'expired_token',
          type: 'refresh'
        },
        process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret',
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      const response = await request(app)
        .post('/api/auth/refresh')
        .set('X-Tenant-ID', tenantId)
        .send({ refreshToken: expiredToken });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Invalid or expired');
    });
  });

  describe('Access Token Validation', () => {
    test('should accept valid access tokens', async () => {
      const response = await request(app)
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', tenantId);

      expect(response.status).toBe(200);
      expect(response.body.sessions).toBeDefined();
    });

    test('should reject blacklisted access tokens', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .set('X-Tenant-ID', tenantId)
        .send({
          email: 'test@example.com',
          password: 'password123'
        });
      const blacklistedAccessToken = loginResponse.body.accessToken;

      // Blacklist a throwaway access token so the shared suite token remains usable.
      await tokenBlacklistService.blacklistToken(blacklistedAccessToken, 'access', 'test_blacklist');

      const response = await request(app)
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${blacklistedAccessToken}`)
        .set('X-Tenant-ID', tenantId);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('revoked for security reasons');
    });

    test('should reject expired access tokens', async () => {
      // Create an expired access token
      const expiredToken = jwt.sign(
        { 
          userId: testUser.id, 
          tenantId: testUser.tenantId,
          type: 'access'
        },
        process.env.JWT_ACCESS_SECRET || 'fallback_access_secret',
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      const response = await request(app)
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${expiredToken}`)
        .set('X-Tenant-ID', tenantId);

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('expired');
    });
  });

  describe('Token Revocation', () => {
    test('should revoke specific refresh token on logout', async () => {
      // First login to get fresh tokens
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .set('X-Tenant-ID', tenantId)
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      const logoutResponse = await request(app)
        .post('/api/auth/logout')
        .set('X-Tenant-ID', tenantId)
        .send({ 
          refreshToken: loginResponse.body.refreshToken 
        });

      expect(logoutResponse.status).toBe(200);

      // Token should be blacklisted
      const isBlacklisted = await tokenBlacklistService.isTokenBlacklisted(
        loginResponse.body.refreshToken, 
        'refresh'
      );
      expect(isBlacklisted).toBe(true);

      // Should not be able to refresh with this token
      const refreshResponse = await request(app)
        .post('/api/auth/refresh')
        .set('X-Tenant-ID', tenantId)
        .send({ 
          refreshToken: loginResponse.body.refreshToken 
        });

      expect(refreshResponse.status).toBe(403);
    });

    test('should revoke all user tokens', async () => {
      // Login multiple times to create multiple refresh tokens
      const tokens = [];
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
          .post('/api/auth/login')
          .set('X-Tenant-ID', tenantId)
          .send({
            email: 'test@example.com',
            password: 'password123'
          });
        tokens.push(response.body.refreshToken);
      }

      // Revoke all tokens
      const revokeResponse = await request(app)
        .post('/api/auth/revoke-all')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', tenantId);

      expect(revokeResponse.status).toBe(200);

      // All tokens should be blacklisted
      for (const token of tokens) {
        const isBlacklisted = await tokenBlacklistService.isTokenBlacklisted(token, 'refresh');
        expect(isBlacklisted).toBe(true);
      }

      // Should not be able to refresh with any token
      for (const token of tokens) {
        const refreshResponse = await request(app)
          .post('/api/auth/refresh')
          .set('X-Tenant-ID', tenantId)
          .send({ refreshToken: token });

        expect(refreshResponse.status).toBe(403);
      }
    });
  });

  describe('Session Management', () => {
    test('should list active sessions', async () => {
      // Create multiple sessions
      await request(app)
        .post('/api/auth/login')
        .set('X-Tenant-ID', tenantId)
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      const response = await request(app)
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', tenantId);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.sessions)).toBe(true);
      expect(response.body.sessions.length).toBeGreaterThan(0);
      
      // Check session structure
      const session = response.body.sessions[0];
      expect(session.id).toBeDefined();
      expect(session.deviceInfo).toBeDefined();
      expect(session.createdAt).toBeDefined();
      expect(session.expiresAt).toBeDefined();
    });
  });

  describe('Concurrent Session Limits', () => {
    test('should enforce maximum active sessions per user', async () => {
      // Create multiple refresh tokens to test limit
      const tokens = [];
      const maxTokens = 6; // One more than the limit (5)

      for (let i = 0; i < maxTokens; i++) {
        const response = await request(app)
          .post('/api/auth/login')
          .set('X-Tenant-ID', tenantId)
          .send({
            email: 'test@example.com',
            password: 'password123'
          });
        tokens.push(response.body.refreshToken);
      }

      // Check that only 5 tokens are active
      const activeTokens = await prisma.refreshToken.findMany({
        where: {
          userId: testUser.id,
          tenantId,
          isActive: true,
          expiresAt: { gt: new Date() }
        }
      });

      expect(activeTokens.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Security Features', () => {
    test('should detect suspicious refresh patterns', async () => {
      // Simulate rapid refresh attempts (potential token theft)
      const suspiciousToken = refreshToken;
      
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/refresh')
          .set('X-Tenant-ID', tenantId)
          .send({ refreshToken: suspiciousToken })
          .catch(() => {}); // Ignore failures for this test
      }

      const metrics = await tokenMetricsService.getMetrics();
      expect(metrics.refreshFailures).toBeGreaterThan(0);
    });

    test('should validate token type in JWT', async () => {
      // Create a token with wrong type
      const wrongTypeToken = jwt.sign(
        { 
          userId: testUser.id, 
          tenantId: testUser.tenantId,
          type: 'wrong_type'
        },
        process.env.JWT_ACCESS_SECRET || 'fallback_access_secret',
        { expiresIn: '15m' }
      );

      const response = await request(app)
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${wrongTypeToken}`)
        .set('X-Tenant-ID', tenantId);

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Invalid token type');
    });
  });
});
