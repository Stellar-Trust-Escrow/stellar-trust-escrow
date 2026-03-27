/* eslint-disable no-unused-vars */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../../lib/prisma.js';

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

function normalizeWalletAddress(body = {}) {
  return body.walletAddress || body.stellarAddress || null;
}

// Helper to generate tokens
const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { userId: user.id, tenantId: user.tenantId, address: user.walletAddress ?? null },
    process.env.JWT_ACCESS_SECRET || 'fallback_access_secret',
    { expiresIn: process.env.JWT_ACCESS_EXPIRATION || '15m' },
  );

  const refreshToken = jwt.sign(
    { userId: user.id, tenantId: user.tenantId, address: user.walletAddress ?? null },
    process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret',
    { expiresIn: process.env.JWT_REFRESH_EXPIRATION || '7d' },
  );

  return { accessToken, refreshToken };
};

export const register = async (req, res) => {
  try {
    const { email, password } = req.body;
    const walletAddress = normalizeWalletAddress(req.body);
    const tenantId = req.tenant?.id;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context is required' });
    }

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (walletAddress && !STELLAR_ADDRESS_RE.test(walletAddress)) {
      return res.status(400).json({ error: 'Invalid Stellar wallet address' });
    }

    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: { email, tenantId },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    if (walletAddress) {
      const existingWalletUser = await prisma.user.findFirst({
        where: { tenantId, walletAddress },
        select: { id: true },
      });

      if (existingWalletUser) {
        return res.status(400).json({ error: 'Wallet address is already linked to another user' });
      }
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = await prisma.user.create({
      data: {
        tenantId,
        email,
        walletAddress,
        password: hashedPassword,
      },
    });

    res.status(201).json({
      message: 'User registered successfully',
      userId: user.id,
      walletAddress: user.walletAddress,
      tenant: { id: req.tenant.id, slug: req.tenant.slug },
    });
  } catch (error) {
    console.error('[Register] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const tenantId = req.tenant?.id;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context is required' });
    }

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = await prisma.user.findFirst({
      where: { email, tenantId },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user);

    // Save refresh token to user in DB
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken },
    });

    res.json({
      accessToken,
      refreshToken,
      userId: user.id,
      walletAddress: user.walletAddress,
      tenant: { id: req.tenant.id, slug: req.tenant.slug },
    });
  } catch (error) {
    console.error('[Login] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const tenantId = req.tenant?.id;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context is required' });
    }

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token is required' });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(
        refreshToken,
        process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret',
      );
    } catch (_err) {
      return res.status(403).json({ error: 'Invalid or expired refresh token' });
    }

    if (decoded.tenantId && decoded.tenantId !== tenantId) {
      return res.status(403).json({ error: 'Refresh token does not belong to this tenant' });
    }

    // Verify against database
    const user = await prisma.user.findFirst({
      where: { id: decoded.userId, tenantId },
    });

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(403).json({ error: 'Invalid refresh token' });
    }

    // Generate NEW tokens
    const tokens = generateTokens(user);

    // Update refresh token in DB
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: tokens.refreshToken },
    });

    res.json({ ...tokens, walletAddress: user.walletAddress });
  } catch (error) {
    console.error('[Refresh] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const tenantId = req.tenant?.id;

    // We could extract userId from auth middleware here if this route was protected.
    // However, logout is often called just with the token to revoke.
    // If the route is protected, we can just use req.user.userId

    // Attempt to decode the token to find the user
    let decoded;
    try {
      if (refreshToken) {
        decoded = jwt.verify(
          refreshToken,
          process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret',
          { ignoreExpiration: true }, // allow logout even if expired
        );
      }
    } catch (_err) {
      // If we can't decode, just move on
    }

    if (decoded && decoded.userId) {
      if (decoded.tenantId && tenantId && decoded.tenantId !== tenantId) {
        return res.status(403).json({ error: 'Refresh token does not belong to this tenant' });
      }

      await prisma.user.updateMany({
        where: { id: decoded.userId, tenantId: tenantId ?? decoded.tenantId },
        data: { refreshToken: null },
      });
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('[Logout] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export default { register, login, refresh, logout };
