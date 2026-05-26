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

export const distributeRoomKey = async (req, res) => {
  try {
    const { escrowId } = req.params;
    const { encryptedKeys } = req.body;
    if (!encryptedKeys || typeof encryptedKeys !== 'object') {
      return res.status(400).json({ error: 'encryptedKeys object required' });
    }

    const escrow = await prisma.escrow.findUnique({
      where: { id: BigInt(escrowId) },
      select: { clientAddress: true, freelancerAddress: true, arbiterAddress: true },
    });
    if (!escrow) return res.status(404).json({ error: 'Escrow not found' });

    const participants = [escrow.clientAddress, escrow.freelancerAddress, escrow.arbiterAddress].filter(Boolean);
    if (!participants.includes(req.user.address)) {
      return res.status(403).json({ error: 'Not a participant in this escrow' });
    }

    const roomId = `dispute:${escrowId}`;
    await prisma.$transaction(
      Object.entries(encryptedKeys).map(([address, encryptedKey]) =>
        prisma.chatRoomKey.upsert({
          where: { roomId_address: { roomId, address } },
          create: { roomId, address, encryptedKey },
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
    const record = await prisma.chatRoomKey.findUnique({
      where: { roomId_address: { roomId, address: req.user.address } },
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

    const escrow = await prisma.escrow.findUnique({
      where: { id: BigInt(escrowId) },
      select: { clientAddress: true, freelancerAddress: true, arbiterAddress: true, status: true },
    });
    if (!escrow) return res.status(404).json({ error: 'Escrow not found' });
    if (escrow.status !== 'Disputed') {
      return res.status(409).json({ error: 'Chat only available for disputed escrows' });
    }

    const participants = [escrow.clientAddress, escrow.freelancerAddress, escrow.arbiterAddress].filter(Boolean);
    if (!participants.includes(req.user.address)) {
      return res.status(403).json({ error: 'Not a participant in this escrow' });
    }

    const message = await prisma.chatMessage.create({
      data: { roomId: `dispute:${escrowId}`, senderAddress: req.user.address, ciphertext, iv, tag, sentAt: new Date() },
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

    const escrow = await prisma.escrow.findUnique({
      where: { id: BigInt(escrowId) },
      select: { clientAddress: true, freelancerAddress: true, arbiterAddress: true },
    });
    if (!escrow) return res.status(404).json({ error: 'Escrow not found' });

    const participants = [escrow.clientAddress, escrow.freelancerAddress, escrow.arbiterAddress].filter(Boolean);
    if (!participants.includes(req.user.address)) {
      return res.status(403).json({ error: 'Not a participant in this escrow' });
    }

    const [data, total] = await prisma.$transaction([
      prisma.chatMessage.findMany({
        where: { roomId }, skip, take: limit, orderBy: { sentAt: 'asc' },
        select: { id: true, senderAddress: true, ciphertext: true, iv: true, tag: true, sentAt: true },
      }),
      prisma.chatMessage.count({ where: { roomId } }),
    ]);

    return res.json(buildPaginatedResponse(data, { total, page, limit }));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export default { distributeRoomKey, getRoomKey, sendMessage, getMessages };
