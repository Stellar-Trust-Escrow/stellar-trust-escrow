import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import prisma from '../../lib/prisma.js';
import authRouter from '../../api/routes/auth.js';
import authService from '../../services/authService.js';

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/v1/auth', authRouter);
  return app;
};

describe('authService refresh token rotation', () => {
  let tenant;
  let user;
  let app;

  beforeEach(async () => {
    await prisma.refreshToken.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.tenant.deleteMany({});

    tenant = await prisma.tenant.create({
      data: {
        id: 'tenant-auth-service',
        slug: 'tenant-auth-service',
        name: 'Auth Service Tenant',
        status: 'active',
      },
    });

    const hashedPassword = await bcrypt.hash('password123', 10);
    user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'auth@example.com',
        password: hashedPassword,
      },
    });

    app = makeApp();
  });

  test('reusing a previously rotated refresh token revokes the whole family', async () => {
    const firstLogin = await authService.login({ email: user.email, password: 'password123' });
    const secondLogin = await authService.refresh({ refreshToken: firstLogin.refreshToken });

    const reuseResponse = await authService.refresh({ refreshToken: firstLogin.refreshToken });

    expect(reuseResponse.error).toBe('TOKEN_REUSE_DETECTED');
    expect(reuseResponse.status).toBe(401);

    const familyTokens = await prisma.refreshToken.findMany({
      where: { familyId: firstLogin.familyId },
    });

    expect(familyTokens).toHaveLength(2);
    expect(familyTokens.every((token) => token.revokedAt)).toBe(true);
    expect(familyTokens.some((token) => token.tokenHash === firstLogin.tokenHash)).toBe(true);
    expect(familyTokens.some((token) => token.tokenHash === secondLogin.tokenHash)).toBe(true);
  });

  test('expired tokens return TOKEN_EXPIRED', async () => {
    const { refreshToken, familyId } = await authService.login({ email: user.email, password: 'password123' });

    await prisma.refreshToken.updateMany({
      where: { familyId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const result = await authService.refresh({ refreshToken });

    expect(result.status).toBe(401);
    expect(result.error).toBe('TOKEN_EXPIRED');
  });

  test('valid rotation marks the old token revoked and issues a new token in the same family', async () => {
    const initial = await authService.login({ email: user.email, password: 'password123' });
    const rotated = await authService.refresh({ refreshToken: initial.refreshToken });

    const oldToken = await prisma.refreshToken.findFirst({
      where: { tokenHash: initial.tokenHash },
    });
    const newToken = await prisma.refreshToken.findFirst({
      where: { tokenHash: rotated.tokenHash },
    });

    expect(oldToken.revokedAt).toBeTruthy();
    expect(oldToken.usedAt).toBeTruthy();
    expect(newToken.familyId).toBe(initial.familyId);
    expect(rotated.accessToken).toBeTruthy();
    expect(rotated.refreshToken).toBeTruthy();
  });

  test('logout revokes the current token and blocks later refreshes', async () => {
    const login = await authService.login({ email: user.email, password: 'password123' });

    await authService.logout({ refreshToken: login.refreshToken });

    const result = await authService.refresh({ refreshToken: login.refreshToken });

    expect(result.status).toBe(401);
    expect(result.error).toBe('TOKEN_REVOKED');
  });

  test('integration flow rotates tokens across three generations and preserves family state', async () => {
    const response1 = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'password123' });

    expect(response1.status).toBe(200);
    const firstRefreshToken = response1.body.refreshToken;
    const firstFamilyId = response1.body.familyId;

    const response2 = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`refreshToken=${firstRefreshToken}`]);

    expect(response2.status).toBe(200);
    const secondRefreshToken = response2.body.refreshToken;

    const response3 = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`refreshToken=${secondRefreshToken}`]);

    expect(response3.status).toBe(200);

    const familyTokens = await prisma.refreshToken.findMany({
      where: { familyId: firstFamilyId },
    });

    expect(familyTokens).toHaveLength(3);
    expect(familyTokens.every((token) => token.familyId === firstFamilyId)).toBe(true);
    const revokedTokens = familyTokens.filter((token) => token.revokedAt);
    expect(revokedTokens).toHaveLength(2);
    const activeTokens = familyTokens.filter((token) => !token.revokedAt);
    expect(activeTokens).toHaveLength(1);
  });
});
