import prisma from '../../lib/prisma.js';
import { verifyEntry, verifyChain, exportAuditBundle } from '../../services/auditService.js';

export const getAuditLogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const [data, total] = await prisma.$transaction([
      prisma.adminAuditLog.findMany({
        skip,
        take: limit,
        orderBy: { id: 'desc' }
      }),
      prisma.adminAuditLog.count()
    ]);

    res.json({ data, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const verifySingleEntry = async (req, res) => {
  try {
    const { entryId } = req.params;
    const result = await verifyEntry(entryId);
    if (result.error) {
      return res.status(404).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const verifyAuditChain = async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'Missing from or to query parameters' });
    }
    const result = await verifyChain(from, to);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const exportBundle = async (req, res) => {
  try {
    const { id: escrowId } = req.params;
    const result = await exportAuditBundle(escrowId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
