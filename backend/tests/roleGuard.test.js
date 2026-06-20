/**
 * Tests for backend/api/middleware/roleGuard.js
 */

import { jest } from '@jest/globals';

jest.unstable_mockModule('../config/logger.js', () => ({
  createModuleLogger: () => ({ warn: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));

const { checkPermission, hasPermission, roleCanPerform, ROLES } =
  await import('../api/middleware/roleGuard.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(roles) {
  return { user: { address: 'GABC', roles }, path: '/test' };
}

function makeRes() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}

// ── roleCanPerform ────────────────────────────────────────────────────────────

describe('roleCanPerform', () => {
  it('Client can create_escrow', () => {
    expect(roleCanPerform(ROLES.CLIENT, 'create_escrow')).toBe(true);
  });

  it('Freelancer cannot create_escrow', () => {
    expect(roleCanPerform(ROLES.FREELANCER, 'create_escrow')).toBe(false);
  });

  it('Arbitrator can resolve_dispute', () => {
    expect(roleCanPerform(ROLES.ARBITRATOR, 'resolve_dispute')).toBe(true);
  });

  it('Admin can perform any action', () => {
    expect(roleCanPerform(ROLES.ADMIN, 'create_escrow')).toBe(true);
    expect(roleCanPerform(ROLES.ADMIN, 'resolve_dispute')).toBe(true);
    expect(roleCanPerform(ROLES.ADMIN, 'anything_at_all')).toBe(true);
  });

  it('returns false for unknown role', () => {
    expect(roleCanPerform('Ghost', 'create_escrow')).toBe(false);
  });
});

// ── hasPermission ─────────────────────────────────────────────────────────────

describe('hasPermission', () => {
  it('returns true when any role in the array grants the action', () => {
    expect(hasPermission([ROLES.FREELANCER, ROLES.CLIENT], 'create_escrow')).toBe(true);
  });

  it('returns false when no role grants the action', () => {
    expect(hasPermission([ROLES.FREELANCER], 'create_escrow')).toBe(false);
  });

  it('returns false for empty roles array', () => {
    expect(hasPermission([], 'create_escrow')).toBe(false);
  });

  it('returns false for non-array input', () => {
    expect(hasPermission(null, 'create_escrow')).toBe(false);
  });
});

// ── checkPermission middleware ────────────────────────────────────────────────

describe('checkPermission middleware', () => {
  it('calls next() when role and action are permitted', () => {
    const next = jest.fn();
    const req = makeReq([ROLES.CLIENT]);
    const res = makeRes();

    checkPermission(ROLES.CLIENT, 'create_escrow')(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 when user has no roles', () => {
    const next = jest.fn();
    const req = { user: { address: 'GABC' }, path: '/test' }; // no roles field
    const res = makeRes();

    checkPermission(ROLES.CLIENT, 'create_escrow')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when user lacks the required role', () => {
    const next = jest.fn();
    const req = makeReq([ROLES.FREELANCER]);
    const res = makeRes();

    checkPermission(ROLES.CLIENT, 'create_escrow')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Client') }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when role is present but action is not permitted', () => {
    const next = jest.fn();
    // Freelancer holds the role but cannot resolve_dispute
    const req = makeReq([ROLES.FREELANCER]);
    const res = makeRes();

    checkPermission(ROLES.FREELANCER, 'resolve_dispute')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('Admin bypasses all permission checks', () => {
    const next = jest.fn();
    const req = makeReq([ROLES.ADMIN]);
    const res = makeRes();

    checkPermission(ROLES.CLIENT, 'create_escrow')(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('supports multi-role users — passes if any role satisfies the check', () => {
    const next = jest.fn();
    const req = makeReq([ROLES.FREELANCER, ROLES.ARBITRATOR]);
    const res = makeRes();

    checkPermission(ROLES.ARBITRATOR, 'resolve_dispute')(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('falls back to req.user.role (singular) for legacy tokens', () => {
    const next = jest.fn();
    const req = { user: { address: 'GABC', role: ROLES.CLIENT }, path: '/test' };
    const res = makeRes();

    checkPermission(ROLES.CLIENT, 'create_escrow')(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('returns 403 when req.user is absent', () => {
    const next = jest.fn();
    const req = { path: '/test' };
    const res = makeRes();

    checkPermission(ROLES.CLIENT, 'create_escrow')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
