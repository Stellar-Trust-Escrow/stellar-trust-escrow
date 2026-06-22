/**
 * chatSocket.js — Dynamic authenticated dispute chat namespaces
 *
 * Creates per-dispute Socket.IO namespaces at /dispute/:id.
 * Before a client joins, the handshake middleware:
 *   1. Verifies the JWT from the Authorization header or `token` query param
 *   2. Confirms the wallet address is a party to the dispute
 *      (client, freelancer, or arbitrator on the parent escrow)
 *
 * Usage:
 *   import { attachChatSocket } from './api/sockets/chatSocket.js';
 *   attachChatSocket(io);
 */

import jwt from 'jsonwebtoken';
import prisma from '../../lib/prisma.js';
import { createModuleLogger } from '../../config/logger.js';
import { JWT_SECRET, JWT_ALGORITHM } from '../../config/secrets.js';

const log = createModuleLogger('chatSocket');

const DISPUTE_NS_RE = /^\/dispute\/(\d+)$/;

// ── JWT extraction ────────────────────────────────────────────────────────────

function extractToken(socket) {
  // Prefer Authorization header, fall back to query param
  const auth = socket.handshake.headers?.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return socket.handshake.auth?.token ?? socket.handshake.query?.token ?? null;
}

function verifyJwt(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
    return payload;
  } catch {
    return null;
  }
}

// ── Dispute membership check ──────────────────────────────────────────────────

/**
 * Returns true if `address` is the client, freelancer, or arbitrator
 * on the escrow linked to `disputeId`.
 */
async function isDisputeParty(disputeId, address) {
  if (!address || typeof address !== 'string') return false;

  const dispute = await prisma.dispute.findUnique({
    where: { id: Number(disputeId) },
    select: {
      escrow: {
        select: {
          clientAddress: true,
          freelancerAddress: true,
          arbiterAddress: true,
        },
      },
    },
  });

  if (!dispute?.escrow) return false;

  const { clientAddress, freelancerAddress, arbiterAddress } = dispute.escrow;
  const a = address.trim();
  return a === clientAddress || a === freelancerAddress || a === arbiterAddress;
}

// ── Namespace factory ─────────────────────────────────────────────────────────

/**
 * Creates (or reuses) a Socket.IO namespace for a specific dispute.
 * The namespace is /dispute/:id and uses a room named `dispute:<id>`.
 */
function getOrCreateDisputeNamespace(io, disputeId) {
  const nsp = `/dispute/${disputeId}`;

  // Socket.IO caches namespaces — return existing one if already set up
  if (io._nsps?.has(nsp)) return io.of(nsp);

  const namespace = io.of(nsp);

  // ── Handshake auth middleware ─────────────────────────────────────────────
  namespace.use(async (socket, next) => {
    const token = extractToken(socket);
    if (!token) {
      log.warn({ msg: 'chat_auth_missing', nsp, socketId: socket.id });
      return next(new Error('Authentication required'));
    }

    const payload = verifyJwt(token);
    if (!payload) {
      log.warn({ msg: 'chat_auth_invalid_jwt', nsp, socketId: socket.id });
      return next(new Error('Invalid or expired token'));
    }

    const address = payload.address;
    let allowed = false;
    try {
      allowed = await isDisputeParty(disputeId, address);
    } catch (err) {
      log.error({ msg: 'chat_auth_db_error', nsp, err: err.message });
      return next(new Error('Authorization check failed'));
    }

    if (!allowed) {
      log.warn({ msg: 'chat_auth_denied', nsp, address, socketId: socket.id });
      return next(new Error('Not authorized for this dispute'));
    }

    // Attach verified identity to socket
    socket.data.address = address;
    socket.data.userId = payload.userId ?? payload.sub ?? null;
    socket.data.disputeId = disputeId;

    log.info({ msg: 'chat_auth_ok', nsp, address, socketId: socket.id });
    next();
  });

  // ── Connection handler ────────────────────────────────────────────────────
  namespace.on('connection', (socket) => {
    const room = `dispute:${disputeId}`;
    socket.join(room);

    log.info({
      msg: 'chat_connected',
      nsp,
      room,
      address: socket.data.address,
      socketId: socket.id,
    });

    // Notify room of new participant
    socket.to(room).emit('user:joined', {
      address: socket.data.address,
      timestamp: new Date().toISOString(),
    });

    // ── Incoming message ────────────────────────────────────────────────────
    socket.on('message:send', (data, ack) => {
      if (!data || typeof data.content !== 'string' || !data.content.trim()) {
        if (typeof ack === 'function') ack({ error: 'Empty message' });
        return;
      }

      const message = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        disputeId,
        content: data.content.trim().slice(0, 4000), // cap at 4 KB
        sender: socket.data.address,
        timestamp: new Date().toISOString(),
      };

      // Broadcast to all sockets in the room (including sender)
      namespace.to(room).emit('message:new', message);

      log.info({ msg: 'chat_message', nsp, room, sender: socket.data.address });

      if (typeof ack === 'function') ack({ ok: true, id: message.id });
    });

    // ── Typing indicator ────────────────────────────────────────────────────
    socket.on('typing:start', () => {
      socket.to(room).emit('typing:start', { address: socket.data.address });
    });

    socket.on('typing:stop', () => {
      socket.to(room).emit('typing:stop', { address: socket.data.address });
    });

    // ── Disconnect ──────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      log.info({
        msg: 'chat_disconnected',
        nsp,
        address: socket.data.address,
        reason,
        socketId: socket.id,
      });
      socket.to(room).emit('user:left', {
        address: socket.data.address,
        timestamp: new Date().toISOString(),
      });
    });
  });

  return namespace;
}

// ── Dynamic namespace routing ─────────────────────────────────────────────────

/**
 * Attaches a dynamic namespace handler to the Socket.IO server.
 * Any connection to /dispute/:id is intercepted here.
 *
 * @param {import('socket.io').Server} io
 */
export function attachChatSocket(io) {
  // Socket.IO supports regex-based dynamic namespaces
  io.of(DISPUTE_NS_RE).on('connection', async (socket) => {
    // Extract disputeId from the namespace name
    const match = socket.nsp.name.match(DISPUTE_NS_RE);
    if (!match) {
      socket.disconnect(true);
      return;
    }

    const disputeId = Number(match[1]);

    // Re-run auth inline (dynamic namespace middleware runs before this)
    // but we still need to set up the room and event handlers.
    const room = `dispute:${disputeId}`;
    socket.join(room);

    socket.to(room).emit('user:joined', {
      address: socket.data.address,
      timestamp: new Date().toISOString(),
    });

    socket.on('message:send', (data, ack) => {
      if (!data || typeof data.content !== 'string' || !data.content.trim()) {
        if (typeof ack === 'function') ack({ error: 'Empty message' });
        return;
      }
      const message = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        disputeId,
        content: data.content.trim().slice(0, 4000),
        sender: socket.data.address,
        timestamp: new Date().toISOString(),
      };
      socket.nsp.to(room).emit('message:new', message);
      if (typeof ack === 'function') ack({ ok: true, id: message.id });
    });

    socket.on('typing:start', () => {
      socket.to(room).emit('typing:start', { address: socket.data.address });
    });

    socket.on('typing:stop', () => {
      socket.to(room).emit('typing:stop', { address: socket.data.address });
    });

    socket.on('disconnect', () => {
      socket.to(room).emit('user:left', {
        address: socket.data.address,
        timestamp: new Date().toISOString(),
      });
    });
  });

  // Apply auth middleware to the dynamic namespace pattern
  io.of(DISPUTE_NS_RE).use(async (socket, next) => {
    const match = socket.nsp.name.match(DISPUTE_NS_RE);
    if (!match) return next(new Error('Invalid namespace'));

    const disputeId = Number(match[1]);

    const token = extractToken(socket);
    if (!token) return next(new Error('Authentication required'));

    const payload = verifyJwt(token);
    if (!payload) return next(new Error('Invalid or expired token'));

    const address = payload.address;
    let allowed = false;
    try {
      allowed = await isDisputeParty(disputeId, address);
    } catch (err) {
      log.error({ msg: 'chat_auth_db_error', err: err.message });
      return next(new Error('Authorization check failed'));
    }

    if (!allowed) {
      log.warn({ msg: 'chat_auth_denied', disputeId, address });
      return next(new Error('Not authorized for this dispute'));
    }

    socket.data.address = address;
    socket.data.userId = payload.userId ?? payload.sub ?? null;
    socket.data.disputeId = disputeId;
    next();
  });

  log.info({ msg: 'chat_socket_attached', pattern: DISPUTE_NS_RE.toString() });
}

export { getOrCreateDisputeNamespace, isDisputeParty };
