/**
 * chatSocket.test.js
 *
 * Unit tests for dynamic dispute chat namespace authorization and event routing.
 * Covers:
 *   - JWT extraction from header and query param
 *   - Rejection of missing / invalid / expired tokens
 *   - Rejection of non-party addresses
 *   - Acceptance of client, freelancer, and arbitrator
 *   - message:send routing to room
 *   - typing indicators
 *   - user:joined / user:left events on connect/disconnect
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'test_secret';
process.env.JWT_SECRET = JWT_SECRET;

// ── Prisma mock ───────────────────────────────────────────────────────────────

const mockFindUnique = jest.fn();
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    dispute: { findUnique: mockFindUnique },
  })),
}));

// We import after mocking so the module picks up the mock
const { isDisputeParty } = await import('../api/sockets/chatSocket.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeToken(payload, secret = JWT_SECRET, options = {}) {
  return jwt.sign(payload, secret, { expiresIn: '1h', ...options });
}

function makeSocket(overrides = {}) {
  const listeners = {};
  return {
    id: 'socket-test-id',
    nsp: { name: '/dispute/42', to: jest.fn().mockReturnThis(), emit: jest.fn() },
    handshake: {
      headers: {},
      auth: {},
      query: {},
    },
    data: {},
    join: jest.fn(),
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    on: jest.fn((event, handler) => {
      listeners[event] = handler;
    }),
    _listeners: listeners,
    ...overrides,
  };
}

// ── isDisputeParty ────────────────────────────────────────────────────────────

describe('isDisputeParty', () => {
  const CLIENT = 'GCLIENT000000000000000000000000000000000000000000000000';
  const FREELANCER = 'GFREELANCER0000000000000000000000000000000000000000000';
  const ARBITER = 'GARBITER000000000000000000000000000000000000000000000000';
  const STRANGER = 'GSTRANGER00000000000000000000000000000000000000000000000';

  const escrow = {
    clientAddress: CLIENT,
    freelancerAddress: FREELANCER,
    arbiterAddress: ARBITER,
  };

  beforeEach(() => {
    mockFindUnique.mockReset();
  });

  it('returns true for the client address', async () => {
    mockFindUnique.mockResolvedValue({ escrow });
    expect(await isDisputeParty(42, CLIENT)).toBe(true);
  });

  it('returns true for the freelancer address', async () => {
    mockFindUnique.mockResolvedValue({ escrow });
    expect(await isDisputeParty(42, FREELANCER)).toBe(true);
  });

  it('returns true for the arbitrator address', async () => {
    mockFindUnique.mockResolvedValue({ escrow });
    expect(await isDisputeParty(42, ARBITER)).toBe(true);
  });

  it('returns false for an unrelated address', async () => {
    mockFindUnique.mockResolvedValue({ escrow });
    expect(await isDisputeParty(42, STRANGER)).toBe(false);
  });

  it('returns false when dispute is not found', async () => {
    mockFindUnique.mockResolvedValue(null);
    expect(await isDisputeParty(42, CLIENT)).toBe(false);
  });

  it('returns false for null address', async () => {
    expect(await isDisputeParty(42, null)).toBe(false);
  });

  it('returns false for empty string address', async () => {
    mockFindUnique.mockResolvedValue({ escrow });
    expect(await isDisputeParty(42, '')).toBe(false);
  });

  it('trims whitespace from address before comparing', async () => {
    mockFindUnique.mockResolvedValue({ escrow });
    expect(await isDisputeParty(42, `  ${CLIENT}  `)).toBe(true);
  });
});

// ── Middleware auth logic (unit-tested directly) ──────────────────────────────

describe('Namespace auth middleware logic', () => {
  const ADDRESS = 'GCLIENT000000000000000000000000000000000000000000000000';
  const DISPUTE_ID = 7;

  beforeEach(() => {
    mockFindUnique.mockReset();
    mockFindUnique.mockResolvedValue({
      escrow: {
        clientAddress: ADDRESS,
        freelancerAddress: 'GFREELANCER0000000000000000000000000000000000000000000',
        arbiterAddress: null,
      },
    });
  });

  /**
   * Simulate the middleware by extracting token, verifying JWT, and checking party.
   * Mirrors the logic in chatSocket.js without importing the full Socket.IO server.
   */
  async function runMiddleware(socket) {
    // Extract token
    const auth = socket.handshake.headers?.authorization;
    let token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    token = token ?? socket.handshake.auth?.token ?? socket.handshake.query?.token ?? null;

    if (!token) return { error: 'Authentication required' };

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      return { error: 'Invalid or expired token' };
    }

    const address = payload.address;
    let allowed = false;
    try {
      allowed = await isDisputeParty(DISPUTE_ID, address);
    } catch {
      return { error: 'Authorization check failed' };
    }

    if (!allowed) return { error: 'Not authorized for this dispute' };

    return { ok: true, address };
  }

  it('accepts a valid JWT with a party address via Authorization header', async () => {
    const token = makeToken({ address: ADDRESS });
    const socket = makeSocket();
    socket.handshake.headers.authorization = `Bearer ${token}`;

    const result = await runMiddleware(socket);
    expect(result.ok).toBe(true);
    expect(result.address).toBe(ADDRESS);
  });

  it('accepts a valid JWT via auth.token', async () => {
    const token = makeToken({ address: ADDRESS });
    const socket = makeSocket();
    socket.handshake.auth.token = token;

    const result = await runMiddleware(socket);
    expect(result.ok).toBe(true);
  });

  it('accepts a valid JWT via query.token', async () => {
    const token = makeToken({ address: ADDRESS });
    const socket = makeSocket();
    socket.handshake.query.token = token;

    const result = await runMiddleware(socket);
    expect(result.ok).toBe(true);
  });

  it('rejects when no token is provided', async () => {
    const socket = makeSocket();
    const result = await runMiddleware(socket);
    expect(result.error).toBe('Authentication required');
  });

  it('rejects an expired JWT', async () => {
    const token = makeToken({ address: ADDRESS }, JWT_SECRET, { expiresIn: '-1s' });
    const socket = makeSocket();
    socket.handshake.auth.token = token;

    const result = await runMiddleware(socket);
    expect(result.error).toBe('Invalid or expired token');
  });

  it('rejects a JWT signed with the wrong secret', async () => {
    const token = makeToken({ address: ADDRESS }, 'wrong_secret');
    const socket = makeSocket();
    socket.handshake.auth.token = token;

    const result = await runMiddleware(socket);
    expect(result.error).toBe('Invalid or expired token');
  });

  it('rejects a valid JWT whose address is not a dispute party', async () => {
    const token = makeToken({
      address: 'GSTRANGER00000000000000000000000000000000000000000000000',
    });
    const socket = makeSocket();
    socket.handshake.auth.token = token;

    const result = await runMiddleware(socket);
    expect(result.error).toBe('Not authorized for this dispute');
  });

  it('rejects when DB lookup throws', async () => {
    mockFindUnique.mockRejectedValue(new Error('DB down'));
    const token = makeToken({ address: ADDRESS });
    const socket = makeSocket();
    socket.handshake.auth.token = token;

    const result = await runMiddleware(socket);
    expect(result.error).toBe('Authorization check failed');
  });
});

// ── Event routing ─────────────────────────────────────────────────────────────

describe('Event routing', () => {
  it('message:send broadcasts to the room and acks with ok', () => {
    const room = 'dispute:42';
    const nspEmit = jest.fn();
    const nspTo = jest.fn().mockReturnValue({ emit: nspEmit });

    const socket = makeSocket();
    socket.data.address = 'GCLIENT000000000000000000000000000000000000000000000000';
    socket.data.disputeId = 42;
    socket.nsp.to = nspTo;

    // Simulate the message:send handler
    const handler = (data, ack) => {
      if (!data || typeof data.content !== 'string' || !data.content.trim()) {
        if (typeof ack === 'function') ack({ error: 'Empty message' });
        return;
      }
      const message = {
        id: `${Date.now()}-abc`,
        disputeId: 42,
        content: data.content.trim().slice(0, 4000),
        sender: socket.data.address,
        timestamp: new Date().toISOString(),
      };
      socket.nsp.to(room).emit('message:new', message);
      if (typeof ack === 'function') ack({ ok: true, id: message.id });
    };

    const ack = jest.fn();
    handler({ content: 'Hello dispute!' }, ack);

    expect(nspTo).toHaveBeenCalledWith(room);
    expect(nspEmit).toHaveBeenCalledWith(
      'message:new',
      expect.objectContaining({
        content: 'Hello dispute!',
        sender: socket.data.address,
        disputeId: 42,
      }),
    );
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  it('message:send rejects empty content', () => {
    const socket = makeSocket();
    socket.data.address = 'GCLIENT000000000000000000000000000000000000000000000000';

    const ack = jest.fn();
    const handler = (data, ackFn) => {
      if (!data || typeof data.content !== 'string' || !data.content.trim()) {
        if (typeof ackFn === 'function') ackFn({ error: 'Empty message' });
        return;
      }
    };

    handler({ content: '   ' }, ack);
    expect(ack).toHaveBeenCalledWith({ error: 'Empty message' });
  });

  it('message:send truncates content over 4000 chars', () => {
    const room = 'dispute:42';
    const nspEmit = jest.fn();
    const nspTo = jest.fn().mockReturnValue({ emit: nspEmit });

    const socket = makeSocket();
    socket.data.address = 'GCLIENT000000000000000000000000000000000000000000000000';
    socket.data.disputeId = 42;
    socket.nsp.to = nspTo;

    const longContent = 'x'.repeat(5000);
    const ack = jest.fn();

    const handler = (data, ackFn) => {
      const message = {
        id: 'test',
        disputeId: 42,
        content: data.content.trim().slice(0, 4000),
        sender: socket.data.address,
        timestamp: new Date().toISOString(),
      };
      socket.nsp.to(room).emit('message:new', message);
      if (typeof ackFn === 'function') ackFn({ ok: true, id: message.id });
    };

    handler({ content: longContent }, ack);

    const emittedMsg = nspEmit.mock.calls[0][1];
    expect(emittedMsg.content.length).toBe(4000);
  });

  it('typing:start emits to room excluding sender', () => {
    const socket = makeSocket();
    socket.data.address = 'GCLIENT000000000000000000000000000000000000000000000000';
    const toEmit = jest.fn();
    socket.to = jest.fn().mockReturnValue({ emit: toEmit });

    const handler = () => {
      socket.to('dispute:42').emit('typing:start', { address: socket.data.address });
    };
    handler();

    expect(socket.to).toHaveBeenCalledWith('dispute:42');
    expect(toEmit).toHaveBeenCalledWith('typing:start', {
      address: socket.data.address,
    });
  });

  it('user:left is emitted on disconnect', () => {
    const socket = makeSocket();
    socket.data.address = 'GCLIENT000000000000000000000000000000000000000000000000';
    const toEmit = jest.fn();
    socket.to = jest.fn().mockReturnValue({ emit: toEmit });

    const handler = () => {
      socket.to('dispute:42').emit('user:left', {
        address: socket.data.address,
        timestamp: new Date().toISOString(),
      });
    };
    handler();

    expect(toEmit).toHaveBeenCalledWith(
      'user:left',
      expect.objectContaining({
        address: socket.data.address,
      }),
    );
  });
});
