import express from 'express';
import authService from '../../services/authService.js';

const router = express.Router();

router.post('/login', async (req, res) => {
  const result = await authService.login({
    email: req.body.email,
    password: req.body.password,
  });

  if (result.status !== 200) {
    return res.status(result.status).json({ error: result.error });
  }

  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/api/v1/auth/refresh',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return res.json({
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    familyId: result.familyId,
    userId: result.userId,
  });
});

router.post('/refresh', async (req, res) => {
  const refreshTokenFromCookie = req.cookies?.refreshToken || req.body?.refreshToken;
  const result = await authService.refresh({ refreshToken: refreshTokenFromCookie });

  if (result.status !== 200) {
    return res.status(result.status).json({ error: result.error });
  }

  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/api/v1/auth/refresh',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return res.json({
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    familyId: result.familyId,
    userId: result.userId,
  });
});

router.post('/logout', async (req, res) => {
  const refreshTokenFromCookie = req.cookies?.refreshToken || req.body?.refreshToken;
  const result = await authService.logout({ refreshToken: refreshTokenFromCookie });

  res.clearCookie('refreshToken', { path: '/api/v1/auth/refresh' });
  return res.json({ ok: true, status: result.status });
});

export default router;
