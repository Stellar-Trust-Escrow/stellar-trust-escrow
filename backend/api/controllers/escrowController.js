/**
 * Escrow Controller
 *
 * Handles HTTP requests for escrow-related routes.
 * Reads from the PostgreSQL database (indexed from chain events).
 * Write operations broadcast pre-signed transactions to Stellar.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * GET /api/escrows
 *
 * Returns a paginated list of all escrows.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 *
 * Query params:
 *   - page     {number}  default 1
 *   - limit    {number}  default 20, max 100
 *   - status   {string}  filter by EscrowStatus (Active|Completed|Disputed|Cancelled)
 *   - client   {string}  filter by client Stellar address
 *   - freelancer {string} filter by freelancer address
 *
 * TODO (contributor — medium, Issue #23):
 * 1. Parse and validate query params
 * 2. Build Prisma query with filters and pagination
 * 3. Return { data: EscrowSummary[], total: number, page: number, limit: number }
 */
const listEscrows = async (req, res) => {
  try {
    // TODO: implement
    res.status(501).json({ error: 'Not implemented — see Issue #23' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/escrows/:id
 *
 * Returns full escrow details including milestone list.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 *
 * TODO (contributor — medium, Issue #23):
 * 1. Parse `req.params.id` as integer
 * 2. Query escrow + milestones from DB
 * 3. Return 404 if not found
 * 4. Return full EscrowDetail object
 */
const getEscrow = async (req, res) => {
  try {
    const { id } = req.params;
    // TODO: implement
    res.status(501).json({ error: 'Not implemented — see Issue #23', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/escrows/broadcast
 *
 * Broadcasts a pre-signed Stellar transaction XDR to the network.
 * Used for create_escrow, approve_milestone, etc.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 *
 * Body: { signedXdr: string }
 *
 * TODO (contributor — hard, Issue #20):
 * 1. Validate signedXdr is a valid base64 XDR string
 * 2. Submit to Stellar via StellarSdk.Server.submitTransaction()
 * 3. Wait for confirmation
 * 4. Parse resulting transaction to extract contract events
 * 5. Update DB optimistically (or let indexer handle it)
 * 6. Return { success: true, hash: string }
 */
const broadcastCreateEscrow = async (req, res) => {
  try {
    const { signedXdr } = req.body;
    // TODO: implement
    res.status(501).json({ error: 'Not implemented — see Issue #20', signedXdr });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/escrows/:id/milestones
 * TODO (contributor — easy, Issue #23): query milestones for escrow
 */
const getMilestones = async (req, res) => {
  try {
    res.status(501).json({ error: 'Not implemented — see Issue #23' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/escrows/:id/milestones/:milestoneId
 * TODO (contributor — easy, Issue #23)
 */
const getMilestone = async (req, res) => {
  try {
    res.status(501).json({ error: 'Not implemented — see Issue #23' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/escrows/stats/:address
 *
 * Returns per-user escrow statistics aggregated from the DB.
 * Used by the dashboard analytics widgets.
 *
 * @returns {{ total, active, completed, cancelled, disputed, successRate, totalValueLocked }}
 */
const getUserStats = async (req, res) => {
  try {
    const { address } = req.params;

    const [total, active, completed, cancelled, disputed] = await Promise.all([
      prisma.escrow.count({
        where: { OR: [{ clientAddress: address }, { freelancerAddress: address }] },
      }),
      prisma.escrow.count({
        where: { OR: [{ clientAddress: address }, { freelancerAddress: address }], status: 'Active' },
      }),
      prisma.escrow.count({
        where: { OR: [{ clientAddress: address }, { freelancerAddress: address }], status: 'Completed' },
      }),
      prisma.escrow.count({
        where: { OR: [{ clientAddress: address }, { freelancerAddress: address }], status: 'Cancelled' },
      }),
      prisma.escrow.count({
        where: { OR: [{ clientAddress: address }, { freelancerAddress: address }], status: 'Disputed' },
      }),
    ]);

    // Success rate = completed / (completed + cancelled + disputed) * 100
    const finished = completed + cancelled + disputed;
    const successRate = finished > 0 ? Math.round((completed / finished) * 100) : null;

    // Sum of remainingBalance across active escrows as a rough TVL proxy
    const activeEscrows = await prisma.escrow.findMany({
      where: {
        OR: [{ clientAddress: address }, { freelancerAddress: address }],
        status: 'Active',
      },
      select: { remainingBalance: true },
    });
    const totalValueLocked = activeEscrows.reduce(
      (sum, e) => sum + BigInt(e.remainingBalance),
      BigInt(0),
    ).toString();

    res.json({ total, active, completed, cancelled, disputed, successRate, totalValueLocked });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/escrows/activity/:address
 *
 * Returns the 10 most recent escrows (any role) for a given address,
 * ordered by most recently updated. Used for the activity timeline.
 *
 * @returns { escrows: EscrowSummary[] }
 */
const getUserActivity = async (req, res) => {
  try {
    const { address } = req.params;

    const escrows = await prisma.escrow.findMany({
      where: { OR: [{ clientAddress: address }, { freelancerAddress: address }] },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        clientAddress: true,
        freelancerAddress: true,
        status: true,
        totalAmount: true,
        remainingBalance: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({ escrows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export default {
  listEscrows,
  getEscrow,
  broadcastCreateEscrow,
  getMilestones,
  getMilestone,
  getUserStats,
  getUserActivity,
};
