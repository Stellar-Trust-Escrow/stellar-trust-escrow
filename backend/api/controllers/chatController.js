/**
 * Chat Controller — Encrypted Dispute Chat
 *
 * Hybrid encryption: AES-256-GCM room key distributed via ECDH.
 * Backend stores only ciphertext — plaintext never touches the server.
 *
 * Routes:
 *   POST /api/chat/:escrowId/room-key  — distribute encrypted room key
 *   GET  /api/chat/:escrowId/room-key  — fetch your encrypted room key
 *   POST /api/chat/:escrowId/messages  — store encrypted message
 *   GET  /api/chat/:escrowId/messages  — fetch encrypted messages (paginated)
 */

import prisma from '../../lib/prisma.js';
import { buildPaginatedResponse, parsePagination } from '../../lib/pagination.js';

const MAX_MESSAGES_PER_ROOM = 500;

/** Returns the escrow and validates the caller is a participant.  */
async function getEscrowOrFail(escrowId, tenantId, callerAddress, res) {
  const escrow = await prisma.escrow.findFirst({
    where: { id: BigInt(escrowId), tenantId },
    select: { clientAddress: true, freelancerAddress: true, arbiterAddress: true, status: true },
  });
  if (!escrow) {
    res.status(404).json({ error: 'Escrow not found' });
    return null;
  }
  const participants = [
    escrow.clientAddress,
    escrow.freelancerAddress,
    escrow.arbiterAddress,
  ].filter(Boolean);
  if (!participants.includes(callerAddress)) {
    res.status(403).json({ error: 'Not a participant in this escrow' });
    return null;
  }
  return escrow;
}

export const distributeRoomKey = async (req, res) => {
  try {
    const { escrowId } = req.params;
    const { encryptedKeys } = req.body;
    if (!encryptedKeys || typeof encryptedKeys !== 'object') {
      return res.status(400).json({ error: 'encryptedKeys object required' });
    }

    const escrow = await getEscrowOrFail(escrowId, req.tenantId, req.user.address, res);
    if (!escrow) return;

    const roomId = `dispute:${escrowId}`;
    await prisma.$transaction(
      Object.entries(encryptedKeys).map(([address, encryptedKey]) =>
        prisma.chatRoomKey.upsert({
          where: { roomId_address: { roomId, address } },
          create: { roomId, address, encryptedKey, tenantId: req.tenantId },
          update: { encryptedKey },
        }),
      ),
    );

    return res.json({ ok: true, roomId });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const getRoomKey = async (req, res) => {
  try {
    const roomId = `dispute:${req.params.escrowId}`;
    // findFirst lets us scope by tenantId to prevent cross-tenant key leakage
    const record = await prisma.chatRoomKey.findFirst({
      where: { roomId, address: req.user.address, tenantId: req.tenantId },
    });
    if (!record) return res.status(404).json({ error: 'Room key not found for your address' });
    return res.json({ roomId, encryptedKey: record.encryptedKey });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { escrowId } = req.params;
    const { ciphertext, iv, tag } = req.body;
    if (!ciphertext || !iv || !tag) {
      return res.status(400).json({ error: 'ciphertext, iv, and tag are required' });
    }

    const escrow = await getEscrowOrFail(escrowId, req.tenantId, req.user.address, res);
    if (!escrow) return;
    if (escrow.status !== 'Disputed') {
      return res.status(409).json({ error: 'Chat only available for disputed escrows' });
    }

    const roomId = `dispute:${escrowId}`;

    // Enforce per-room message cap to prevent storage abuse
    const count = await prisma.chatMessage.count({ where: { roomId, tenantId: req.tenantId } });
    if (count >= MAX_MESSAGES_PER_ROOM) {
      return res.status(429).json({ error: `Room message limit of ${MAX_MESSAGES_PER_ROOM} reached` });
    }

    const message = await prisma.chatMessage.create({
      data: {
        roomId,
        senderAddress: req.user.address,
        ciphertext,
        iv,
        tag,
        tenantId: req.tenantId,
      },
      select: { id: true, senderAddress: true, sentAt: true },
    });

    return res.status(201).json(message);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { escrowId } = req.params;
    const { page, limit, skip } = parsePagination(req.query);
    const roomId = `dispute:${escrowId}`;

    const escrow = await getEscrowOrFail(escrowId, req.tenantId, req.user.address, res);
    if (!escrow) return;

    const where = { roomId, tenantId: req.tenantId };
    const [data, total] = await prisma.$transaction([
      prisma.chatMessage.findMany({
        where,
        skip,
        take: limit,
        orderBy: { sentAt: 'asc' },
        select: { id: true, senderAddress: true, ciphertext: true, iv: true, tag: true, sentAt: true },
      }),
      prisma.chatMessage.count({ where }),
    ]);

    return res.json(buildPaginatedResponse(data, { total, page, limit }));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export default { distributeRoomKey, getRoomKey, sendMessage, getMessages };
