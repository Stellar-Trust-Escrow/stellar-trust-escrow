/**
 * Escrow Service
 *
 * All multi-table write operations wrapped in Prisma transactions
 * with deadlock retry via withTransaction().
 */

import { withTransaction } from '../lib/transaction.js';
import prisma from '../lib/prisma.js';

export async function fundEscrow(data) {
  return withTransaction(async (tx) => {
    const escrow = await tx.escrow.create({
      data: {
        id: BigInt(data.id),
        clientAddress: data.clientAddress,
        freelancerAddress: data.freelancerAddress,
        arbiterAddress: data.arbiterAddress ?? null,
        tokenAddress: data.tokenAddress,
        totalAmount: String(data.totalAmount),
        remainingBalance: String(data.totalAmount),
        status: 'Active',
        briefHash: data.briefHash,
        deadline: data.deadline ?? null,
        createdAt: new Date(),
        createdLedger: BigInt(data.createdLedger ?? 0),
      },
    });

    await tx.adminAuditLog.create({
      data: {
        action: 'ESCROW_FUNDED',
        targetAddress: data.clientAddress,
        reason: `Escrow ${escrow.id} funded with ${data.totalAmount}`,
        performedBy: data.clientAddress,
        performedAt: new Date(),
      },
    });

    return escrow;
  }, { isolationLevel: 'Serializable' });
}

export async function releaseMilestone({ escrowId, milestoneIndex, amount, callerAddress }) {
  return withTransaction(async (tx) => {
    const escrow = await tx.escrow.findUniqueOrThrow({
      where: { id: BigInt(escrowId) },
      select: { remainingBalance: true, status: true },
    });

    if (escrow.status !== 'Active') {
      throw Object.assign(new Error('Escrow is not active'), { statusCode: 409 });
    }

    const newBalance = BigInt(escrow.remainingBalance) - BigInt(amount);
    if (newBalance < 0n) {
      throw Object.assign(new Error('Insufficient escrow balance'), { statusCode: 422 });
    }

    const [milestone, updatedEscrow] = await Promise.all([
      tx.milestone.update({
        where: { escrowId_milestoneIndex: { escrowId: BigInt(escrowId), milestoneIndex } },
        data: { status: 'Approved', resolvedAt: new Date() },
      }),
      tx.escrow.update({
        where: { id: BigInt(escrowId) },
        data: {
          remainingBalance: String(newBalance),
          ...(newBalance === 0n ? { status: 'Completed' } : {}),
        },
      }),
      tx.adminAuditLog.create({
        data: {
          action: 'MILESTONE_RELEASED',
          targetAddress: callerAddress,
          reason: `Milestone ${milestoneIndex} of escrow ${escrowId} released`,
          performedBy: callerAddress,
          performedAt: new Date(),
        },
      }),
    ]);

    return { milestone, escrow: updatedEscrow };
  });
}

export async function raiseDispute({ escrowId, raisedByAddress, milestoneIndex }) {
  return withTransaction(async (tx) => {
    const escrow = await tx.escrow.findUniqueOrThrow({
      where: { id: BigInt(escrowId) },
      select: { status: true },
    });

    if (escrow.status !== 'Active') {
      throw Object.assign(new Error('Escrow must be Active to raise a dispute'), { statusCode: 409 });
    }

    const ops = [
      tx.escrow.update({ where: { id: BigInt(escrowId) }, data: { status: 'Disputed' } }),
      tx.dispute.create({
        data: { escrowId: BigInt(escrowId), raisedByAddress, raisedAt: new Date() },
      }),
      tx.adminAuditLog.create({
        data: {
          action: 'DISPUTE_RAISED',
          targetAddress: raisedByAddress,
          reason: `Dispute raised on escrow ${escrowId}`,
          performedBy: raisedByAddress,
          performedAt: new Date(),
        },
      }),
    ];

    if (milestoneIndex !== undefined) {
      ops.push(tx.milestone.updateMany({
        where: { escrowId: BigInt(escrowId), milestoneIndex },
        data: { status: 'Rejected' },
      }));
    }

    const [updatedEscrow, dispute] = await Promise.all(ops);
    return { dispute, escrow: updatedEscrow };
  }, { isolationLevel: 'Serializable' });
}

export async function resolveDispute({ escrowId, clientAmount, freelancerAmount, resolvedBy, resolution }) {
  return withTransaction(async (tx) => {
    const escrow = await tx.escrow.findUniqueOrThrow({
      where: { id: BigInt(escrowId) },
      select: { status: true, remainingBalance: true },
    });

    if (escrow.status !== 'Disputed') {
      throw Object.assign(new Error('Escrow is not in Disputed state'), { statusCode: 409 });
    }

    const total = BigInt(clientAmount) + BigInt(freelancerAmount);
    if (total !== BigInt(escrow.remainingBalance)) {
      throw Object.assign(new Error('Amounts must sum to remaining balance'), { statusCode: 422 });
    }

    const [updatedEscrow, dispute] = await Promise.all([
      tx.escrow.update({
        where: { id: BigInt(escrowId) },
        data: { status: 'Completed', remainingBalance: '0' },
      }),
      tx.dispute.update({
        where: { escrowId: BigInt(escrowId) },
        data: { resolvedAt: new Date(), clientAmount: String(clientAmount), freelancerAmount: String(freelancerAmount), resolvedBy, resolution },
      }),
      tx.adminAuditLog.create({
        data: {
          action: 'DISPUTE_RESOLVED',
          targetAddress: resolvedBy,
          reason: resolution ?? `Dispute on escrow ${escrowId} resolved`,
          performedBy: resolvedBy,
          performedAt: new Date(),
        },
      }),
    ]);

    return { dispute, escrow: updatedEscrow };
  }, { isolationLevel: 'Serializable' });
}

export default { fundEscrow, releaseMilestone, raiseDispute, resolveDispute };
