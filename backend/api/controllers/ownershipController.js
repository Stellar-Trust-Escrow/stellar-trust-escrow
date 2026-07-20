import prisma from '../../lib/prisma.js';
import { stellarService } from '../../services/stellarService.js';
import { createModuleLogger } from '../../config/logger.js';

const log = createModuleLogger('ownershipController');

const OWNERSHIP_CONTRACT_ID = process.env.OWNERSHIP_CONTRACT_ID || '';

export async function getOwnership(req, res) {
  const { id: escrowId } = req.params;
  try {
    const ownership = await prisma.escrowOwnership.findUnique({
      where: { escrowId },
    });
    const transferLog = await prisma.ownershipTransferLog.findMany({
      where: { escrowId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ currentOwner: ownership?.currentOwner ?? null, pendingTransfer: null, transferLog });
  } catch (err) {
    log.error({ type: 'ownership_get_error', escrowId, err: err.message });
    res.status(500).json({ error: 'Failed to fetch ownership' });
  }
}

export async function offerTransfer(req, res) {
  const { id: escrowId } = req.params;
  const { newOwner } = req.body;
  const caller = req.user?.address;

  if (!newOwner) return res.status(400).json({ error: 'newOwner is required' });
  if (!OWNERSHIP_CONTRACT_ID) return res.status(503).json({ error: 'Ownership contract not configured' });

  try {
    const xdr = await stellarService.buildContractCall({
      contractId: OWNERSHIP_CONTRACT_ID,
      method: 'offer_transfer',
      args: [caller, BigInt(escrowId), newOwner],
    });
    res.json({ xdr });
  } catch (err) {
    log.error({ type: 'offer_transfer_error', escrowId, err: err.message });
    res.status(500).json({ error: 'Failed to build offer_transfer XDR' });
  }
}

export async function acceptTransfer(req, res) {
  const { id: escrowId } = req.params;
  const caller = req.user?.address;

  if (!OWNERSHIP_CONTRACT_ID) return res.status(503).json({ error: 'Ownership contract not configured' });

  try {
    const xdr = await stellarService.buildContractCall({
      contractId: OWNERSHIP_CONTRACT_ID,
      method: 'accept_transfer',
      args: [caller, BigInt(escrowId)],
    });
    res.json({ xdr });
  } catch (err) {
    log.error({ type: 'accept_transfer_error', escrowId, err: err.message });
    res.status(500).json({ error: 'Failed to build accept_transfer XDR' });
  }
}

export async function cancelTransfer(req, res) {
  const { id: escrowId } = req.params;
  const caller = req.user?.address;

  if (!OWNERSHIP_CONTRACT_ID) return res.status(503).json({ error: 'Ownership contract not configured' });

  try {
    const xdr = await stellarService.buildContractCall({
      contractId: OWNERSHIP_CONTRACT_ID,
      method: 'cancel_transfer',
      args: [caller, BigInt(escrowId)],
    });
    res.json({ xdr });
  } catch (err) {
    log.error({ type: 'cancel_transfer_error', escrowId, err: err.message });
    res.status(500).json({ error: 'Failed to build cancel_transfer XDR' });
  }
}
