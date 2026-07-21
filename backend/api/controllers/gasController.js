import { logControllerError } from '../../config/logger.js';
import gasService from '../../services/gasService.js';

const VALID_URGENCIES = new Set(['low', 'medium', 'high', 'critical']);

function parseUrgency(urgency) {
  return typeof urgency === 'string' ? urgency.toLowerCase() : 'medium';
}

export async function estimateFees(req, res) {
  try {
    const urgency = parseUrgency(req.query.urgency ?? 'medium');
    if (!VALID_URGENCIES.has(urgency)) {
      return res.status(400).json({ error: 'Invalid urgency', code: 'INVALID_URGENCY' });
    }

    const percentiles = await gasService.getFeePercentiles();
    const fee = gasService.recommendFee(urgency);
    const cacheState = await gasService.pollFeeStats();

    return res.json({
      fee,
      urgency,
      unit: percentiles.unit ?? 'stroops',
      source: cacheState.source === 'cache' ? 'cache' : 'default',
      cached_at: cacheState.cachedAt,
    });
  } catch (error) {
    logControllerError('gas.estimateFees', error, req);
    return res.status(500).json({ error: error.message });
  }
}

export async function getFeeStats(req, res) {
  try {
    const percentiles = await gasService.getFeePercentiles();
    return res.json({
      ...percentiles,
      source: 'cache',
      cached_at: new Date().toISOString(),
    });
  } catch (error) {
    logControllerError('gas.getFeeStats', error, req);
    return res.status(500).json({ error: error.message });
  }
}

export async function bumpFee(req, res) {
  try {
    const { innerTxXdr, urgency } = req.body ?? {};
    if (!innerTxXdr || typeof innerTxXdr !== 'string') {
      return res.status(400).json({ error: 'innerTxXdr is required' });
    }

    const parsedUrgency = parseUrgency(urgency ?? 'medium');
    if (!VALID_URGENCIES.has(parsedUrgency)) {
      return res.status(400).json({ error: 'Invalid urgency', code: 'INVALID_URGENCY' });
    }

    const result = await gasService.buildFeeBump(innerTxXdr, parsedUrgency, req.user?.address || 'GA');
    return res.json(result);
  } catch (error) {
    if (error.message?.includes('FEE_BUMP_SOURCE_SECRET')) {
      return res.status(503).json({ error: error.message, code: 'FEE_BUMP_UNAVAILABLE' });
    }
    logControllerError('gas.bumpFee', error, req);
    return res.status(500).json({ error: error.message });
  }
}

export const estimateFee = estimateFees;
export default { estimateFee, estimateFees, getFeeStats, bumpFee };
