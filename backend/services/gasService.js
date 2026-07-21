import IORedis from 'ioredis';

export const DEFAULT_FEE_PERCENTILES = {
  p10: 100,
  p50: 200,
  p90: 300,
  p99: 400,
  unit: 'stroops',
};

const REDIS_KEY = 'stellar:fee_stats';
const REDIS_TTL_SECONDS = 90;
const STALE_TTL_SECONDS = 210;
const DEFAULT_REDIS_CLIENT = new IORedis(
  process.env.REDIS_URL ?? {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  },
);

function normalizePercentiles(payload) {
  if (!payload || typeof payload !== 'object') return null;

  return {
    p10: Number(payload.p10 ?? DEFAULT_FEE_PERCENTILES.p10),
    p50: Number(payload.p50 ?? DEFAULT_FEE_PERCENTILES.p50),
    p90: Number(payload.p90 ?? DEFAULT_FEE_PERCENTILES.p90),
    p99: Number(payload.p99 ?? DEFAULT_FEE_PERCENTILES.p99),
    unit: payload.unit || DEFAULT_FEE_PERCENTILES.unit,
  };
}

function buildCachePayload(percentiles, metadata = {}) {
  return {
    ...percentiles,
    ledger_range_start: metadata.ledgerRangeStart ?? null,
    ledger_range_end: metadata.ledgerRangeEnd ?? null,
    cached_at: metadata.cachedAt ?? new Date().toISOString(),
  };
}

export function createGasService({ redisClient = DEFAULT_REDIS_CLIENT, fetchImpl } = {}) {
  const fetchStats = fetchImpl ?? (async () => {
    const response = await fetch('https://horizon-testnet.stellar.org/fee_stats');
    if (!response.ok) {
      throw new Error(`Fee stats request failed with ${response.status}`);
    }
    const payload = await response.json();
    return payload;
  });

  async function pollFeeStats() {
    try {
      const payload = await fetchStats();
      const percentiles = normalizePercentiles(payload?.fee_charged || payload?.feeStats || payload);
      if (!percentiles) {
        throw new Error('No fee percentile data returned');
      }

      const cachePayload = buildCachePayload(percentiles, {
        ledgerRangeStart: payload?.ledger_range_start ?? payload?.ledgerRangeStart ?? null,
        ledgerRangeEnd: payload?.ledger_range_end ?? payload?.ledgerRangeEnd ?? null,
        cachedAt: new Date().toISOString(),
      });

      await redisClient.set(REDIS_KEY, JSON.stringify(cachePayload), 'EX', REDIS_TTL_SECONDS);
      return { source: 'cache', percentiles, cachedAt: cachePayload.cached_at };
    } catch (error) {
      const stale = await redisClient.get(REDIS_KEY);
      if (stale) {
        await redisClient.expire(REDIS_KEY, STALE_TTL_SECONDS);
        const parsed = JSON.parse(stale);
        return { source: 'cache', percentiles: normalizePercentiles(parsed), cachedAt: parsed.cached_at };
      }

      const percentiles = { ...DEFAULT_FEE_PERCENTILES };
      await redisClient.set(REDIS_KEY, JSON.stringify({ ...percentiles, cached_at: new Date().toISOString() }), 'EX', REDIS_TTL_SECONDS);
      return { source: 'default', percentiles, cachedAt: new Date().toISOString() };
    }
  }

  async function getFeePercentiles() {
    const cached = await redisClient.get(REDIS_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        return normalizePercentiles(parsed) || { ...DEFAULT_FEE_PERCENTILES };
      } catch {
        return { ...DEFAULT_FEE_PERCENTILES };
      }
    }

    return { ...DEFAULT_FEE_PERCENTILES };
  }

  function recommendFee(urgency) {
    const percentiles = { ...DEFAULT_FEE_PERCENTILES };
    const current = getFeePercentiles();
    const resolved = current || percentiles;
    const base = {
      low: resolved.p10,
      medium: resolved.p50,
      high: resolved.p90,
      critical: resolved.p99 * 1.25,
    }[urgency] ?? resolved.p50;

    return Math.round(base);
  }

  async function buildFeeBump(innerTxXdr, urgency, feeSourceAddress) {
    const { xdr: StellarXdr, Keypair, TransactionBuilder, Networks, Operation, Asset, Memo } = await import('@stellar/stellar-sdk');
    const parsed = StellarXdr.TransactionEnvelope.fromXDR(innerTxXdr, 'base64');
    const innerTx = parsed.tx;
    const operationCount = innerTx.operations.length;
    const fee = recommendFee(urgency) * (operationCount + 1);
    const feeSourceSecret = process.env.FEE_BUMP_SOURCE_SECRET;
    if (!feeSourceSecret) {
      throw new Error('FEE_BUMP_SOURCE_SECRET not configured');
    }
    const sourceKeypair = Keypair.fromSecret(feeSourceSecret);
    const feeBumpTx = TransactionBuilder.buildFeeBumpTransaction(
      sourceKeypair,
      fee,
      parsed,
      Networks.TESTNET,
      undefined,
      feeSourceAddress,
    );
    return {
      feeBumpXdr: feeBumpTx.toXDR(),
      estimatedFee: fee,
    };
  }

  return {
    pollFeeStats,
    getFeePercentiles,
    recommendFee,
    buildFeeBump,
  };
}

const gasService = createGasService();
export default gasService;
