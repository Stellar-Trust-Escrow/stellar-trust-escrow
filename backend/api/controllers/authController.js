/* eslint-disable no-unused-vars */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../../lib/prisma.js';

// Helper to generate tokens
const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_ACCESS_SECRET || 'fallback_access_secret',
    { expiresIn: process.env.JWT_ACCESS_EXPIRATION || '15m' },
  );

  const refreshToken = jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret',
    { expiresIn: process.env.JWT_REFRESH_EXPIRATION || '7d' },
  );

  return { accessToken, refreshToken };
};

export const register = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
      },
    });

    res.status(201).json({ message: 'User registered successfully', userId: user.id });
  } catch (error) {
    console.error('[Register] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
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
    const { accessToken, refreshToken } = generateTokens(user.id);

    // Save refresh token to user in DB
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken },
    });

    res.json({ accessToken, refreshToken, userId: user.id });
  } catch (error) {
    console.error('[Login] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;

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
    } catch (err) {
      return res.status(403).json({ error: 'Invalid or expired refresh token' });
    }

    // Verify against database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(403).json({ error: 'Invalid refresh token' });
    }

    // Generate NEW tokens
    const tokens = generateTokens(user.id);

    // Update refresh token in DB
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: tokens.refreshToken },
    });

    res.json(tokens);
  } catch (error) {
    console.error('[Refresh] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;

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
    } catch (err) {
      // If we can't decode, just move on
    }

    if (decoded && decoded.userId) {
      await prisma.user.update({
        where: { id: decoded.userId },
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
