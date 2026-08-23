import { listFlags, createFlag, updateFlag, deleteFlag } from '../../services/featureFlags.js';
import prisma from '../../lib/prisma.js';

export async function index(_req, res) {
  const flags = await listFlags();
  res.json({ data: flags });
}

/**
 * GET /api/v1/flags/:key/status
 *
 * Public, read-only, global on/off check for a single flag — deliberately
 * exposes nothing beyond { enabled }. Used by CI/CD (e.g. the blue-green
 * deploy workflow's cutover gate) where there's no logged-in admin, and by
 * any client that just needs "is this flag on" without full admin access.
 * A flag with per-user targeting/percentage rollout is reported enabled
 * here only when it's globally enabled — the pipeline-gate use case wants
 * an all-or-nothing signal, not partial rollout math.
 */
export async function status(req, res) {
  const flag = await prisma.featureFlag.findUnique({ where: { key: req.params.key } });
  if (!flag) return res.status(404).json({ error: 'Flag not found.' });
  return res.json({ key: flag.key, enabled: flag.isEnabled });
}

export async function create(req, res) {
  try {
    const flag = await createFlag(req.body, req.headers['x-admin-api-key']);
    res.status(201).json({ data: flag });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Flag key already exists.' });
    res.status(400).json({ error: err.message });
  }
}

export async function update(req, res) {
  try {
    const flag = await updateFlag(req.params.key, req.body, req.headers['x-admin-api-key']);
    res.json({ data: flag });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Flag not found.' });
    res.status(400).json({ error: err.message });
  }
}

export async function destroy(req, res) {
  try {
    await deleteFlag(req.params.key, req.headers['x-admin-api-key']);
    res.status(204).end();
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Flag not found.' });
    res.status(400).json({ error: err.message });
  }
}
