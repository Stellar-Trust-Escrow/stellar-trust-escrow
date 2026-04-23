import { listFlags, createFlag, updateFlag, deleteFlag } from '../../services/featureFlags.js';

export async function index(_req, res) {
  const flags = await listFlags();
  res.json({ data: flags });
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
