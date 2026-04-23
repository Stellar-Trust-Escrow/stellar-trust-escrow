/**
 * Reputation Search Service — Elasticsearch primary, Prisma fallback.
 *
 * Index: reputation_records
 * Fields: address, total_score, completed_escrows, disputed_escrows,
 *         disputes_won, total_volume, last_updated, tenant_id
 *
 * Public API:
 *   ensureIndex()          — create index + mapping if absent
 *   indexRecord(record)    — upsert one reputation record
 *   bulkSync(records)      — bulk upsert (used by sync job)
 *   search(query, opts)    — full-text + filter search with Prisma fallback
 *   leaderboard(opts)      — top-N by score with Prisma fallback
 *   syncFromPrisma()       — full re-sync from Prisma (run on startup / cron)
 */

import { Client } from '@elastic/elasticsearch';
import prisma from '../lib/prisma.js';

// ── ES client (lazy, singleton) ───────────────────────────────────────────────

let _client = null;

function getClient() {
  if (_client) return _client;
  const url = process.env.ELASTICSEARCH_URL;
  if (!url) return null;
  _client = new Client({
    node: url,
    ...(process.env.ELASTICSEARCH_API_KEY && {
      auth: { apiKey: process.env.ELASTICSEARCH_API_KEY },
    }),
    requestTimeout: 5000,
  });
  return _client;
}

export function isAvailable() {
  return !!getClient();
}

const INDEX = 'reputation_records';

// ── Index mapping ─────────────────────────────────────────────────────────────

const MAPPING = {
  mappings: {
    properties: {
      address:          { type: 'keyword' },
      tenant_id:        { type: 'keyword' },
      total_score:      { type: 'long' },
      completed_escrows:{ type: 'integer' },
      disputed_escrows: { type: 'integer' },
      disputes_won:     { type: 'integer' },
      total_volume:     { type: 'keyword' },   // stored as string (BigInt)
      last_updated:     { type: 'date' },
      // address prefix field for autocomplete
      address_suggest:  {
        type: 'search_as_you_type',
        max_shingle_size: 3,
      },
    },
  },
  settings: {
    number_of_shards: 1,
    number_of_replicas: 0,
  },
};

export async function ensureIndex() {
  const client = getClient();
  if (!client) return false;
  try {
    const exists = await client.indices.exists({ index: INDEX });
    if (!exists) {
      await client.indices.create({ index: INDEX, body: MAPPING });
      console.log(`[ReputationSearch] Created index "${INDEX}"`);
    }
    return true;
  } catch (err) {
    console.warn('[ReputationSearch] ensureIndex failed:', err.message);
    return false;
  }
}

// ── Document helpers ──────────────────────────────────────────────────────────

function toDoc(record) {
  return {
    address:           record.address,
    tenant_id:         record.tenantId,
    total_score:       Number(record.totalScore ?? 0),
    completed_escrows: record.completedEscrows ?? 0,
    disputed_escrows:  record.disputedEscrows ?? 0,
    disputes_won:      record.disputesWon ?? 0,
    total_volume:      String(record.totalVolume ?? '0'),
    last_updated:      record.lastUpdated ?? record.updatedAt ?? new Date(),
    address_suggest:   record.address,
  };
}

// ── Write operations ──────────────────────────────────────────────────────────

export async function indexRecord(record) {
  const client = getClient();
  if (!client) return false;
  try {
    await client.index({
      index: INDEX,
      id: record.address,
      document: toDoc(record),
    });
    return true;
  } catch (err) {
    console.warn('[ReputationSearch] indexRecord failed:', err.message);
    return false;
  }
}

export async function bulkSync(records) {
  const client = getClient();
  if (!client || records.length === 0) return 0;
  try {
    const ops = records.flatMap((r) => [
      { index: { _index: INDEX, _id: r.address } },
      toDoc(r),
    ]);
    const { errors, items } = await client.bulk({ operations: ops, refresh: false });
    if (errors) {
      const failed = items.filter((i) => i.index?.error).length;
      console.warn(`[ReputationSearch] bulkSync: ${failed} errors`);
    }
    return records.length;
  } catch (err) {
    console.warn('[ReputationSearch] bulkSync failed:', err.message);
    return 0;
  }
}

// ── Full re-sync from Prisma ──────────────────────────────────────────────────

const SYNC_BATCH = 500;

export async function syncFromPrisma() {
  if (!isAvailable()) return 0;
  await ensureIndex();

  let synced = 0;
  let cursor = undefined;

  for (;;) {
    const batch = await prisma.reputationRecord.findMany({
      take: SYNC_BATCH,
      ...(cursor && { skip: 1, cursor: { address: cursor } }),
      orderBy: { address: 'asc' },
    });
    if (batch.length === 0) break;
    synced += await bulkSync(batch);
    cursor = batch[batch.length - 1].address;
    if (batch.length < SYNC_BATCH) break;
  }

  console.log(`[ReputationSearch] syncFromPrisma: synced ${synced} records`);
  return synced;
}

// ── Search ────────────────────────────────────────────────────────────────────

/**
 * Full-text + filter search with Prisma fallback.
 *
 * @param {string} q          - address prefix or partial address
 * @param {object} opts
 * @param {string} [opts.tenantId]
 * @param {number} [opts.limit=10]
 * @param {number} [opts.from=0]
 * @returns {Promise<{ hits: object[], total: number, source: 'es'|'prisma' }>}
 */
export async function search(q, { tenantId, limit = 10, from = 0 } = {}) {
  const client = getClient();

  if (client) {
    try {
      const must = [];
      if (q) {
        must.push({
          multi_match: {
            query: q,
            fields: ['address', 'address_suggest', 'address_suggest._2gram', 'address_suggest._3gram'],
            type: 'bool_prefix',
          },
        });
      }
      if (tenantId) must.push({ term: { tenant_id: tenantId } });

      const { hits } = await client.search({
        index: INDEX,
        body: {
          query: must.length ? { bool: { must } } : { match_all: {} },
          sort: [{ total_score: 'desc' }],
          from,
          size: limit,
        },
      });

      return {
        hits: hits.hits.map((h) => h._source),
        total: typeof hits.total === 'object' ? hits.total.value : hits.total,
        source: 'es',
      };
    } catch (err) {
      console.warn('[ReputationSearch] search ES failed, falling back:', err.message);
    }
  }

  // ── Prisma fallback ───────────────────────────────────────────────────────
  const where = {
    ...(tenantId && { tenantId }),
    ...(q && { address: { contains: q, mode: 'insensitive' } }),
  };
  const [records, total] = await prisma.$transaction([
    prisma.reputationRecord.findMany({
      where, orderBy: { totalScore: 'desc' }, skip: from, take: limit,
    }),
    prisma.reputationRecord.count({ where }),
  ]);
  return { hits: records.map(toDoc), total, source: 'prisma' };
}

// ── Leaderboard aggregation ───────────────────────────────────────────────────

/**
 * Top-N reputation records sorted by score, with Prisma fallback.
 *
 * @param {object} opts
 * @param {string} [opts.tenantId]
 * @param {number} [opts.limit=20]
 * @param {number} [opts.from=0]
 * @returns {Promise<{ hits: object[], total: number, source: 'es'|'prisma' }>}
 */
export async function leaderboard({ tenantId, limit = 20, from = 0 } = {}) {
  return search('', { tenantId, limit, from });
}
