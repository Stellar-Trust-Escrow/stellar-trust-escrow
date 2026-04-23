/**
 * Search Service — Elasticsearch
 * @module services/searchService
 */
import { Client } from '@elastic/elasticsearch';

const INDEX = 'escrows';

const client = new Client({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
  ...(process.env.ELASTICSEARCH_API_KEY && {
    auth: { apiKey: process.env.ELASTICSEARCH_API_KEY },
  }),
});

const INDEX_MAPPING = {
  settings: {
    analysis: {
      analyzer: {
        escrow_analyzer: {
          type: 'custom',
          tokenizer: 'standard',
          filter: ['lowercase', 'asciifolding', 'escrow_edge_ngram'],
        },
        escrow_search_analyzer: {
          type: 'custom',
          tokenizer: 'standard',
          filter: ['lowercase', 'asciifolding'],
        },
      },
      filter: {
        escrow_edge_ngram: { type: 'edge_ngram', min_gram: 2, max_gram: 20 },
      },
    },
  },
  mappings: {
    properties: {
      id: { type: 'keyword' },
      clientAddress: {
        type: 'text',
        analyzer: 'escrow_analyzer',
        search_analyzer: 'escrow_search_analyzer',
        fields: { keyword: { type: 'keyword' } },
      },
      freelancerAddress: {
        type: 'text',
        analyzer: 'escrow_analyzer',
        search_analyzer: 'escrow_search_analyzer',
        fields: { keyword: { type: 'keyword' } },
      },
      arbiterAddress: {
        type: 'text',
        analyzer: 'escrow_analyzer',
        search_analyzer: 'escrow_search_analyzer',
        fields: { keyword: { type: 'keyword' } },
      },
      tokenAddress: { type: 'keyword' },
      status: { type: 'keyword' },
      totalAmount: { type: 'double' },
      remainingBalance: { type: 'double' },
      briefHash: { type: 'keyword' },
      deadline: { type: 'date' },
      createdAt: { type: 'date' },
      updatedAt: { type: 'date' },
      milestones: {
        type: 'nested',
        properties: {
          title: {
            type: 'text',
            analyzer: 'escrow_analyzer',
            search_analyzer: 'escrow_search_analyzer',
          },
          status: { type: 'keyword' },
          amount: { type: 'double' },
        },
      },
      suggest: { type: 'completion', analyzer: 'escrow_search_analyzer' },
    },
  },
};


// ── Analytics ─────────────────────────────────────────────────────────────────
const _analytics = {
  totalSearches: 0,
  topQueries: new Map(),
  zeroResultQueries: new Map(),
};

function _recordQuery(query, resultCount) {
  _analytics.totalSearches++;
  const q = query.toLowerCase().trim();
  _analytics.topQueries.set(q, (_analytics.topQueries.get(q) || 0) + 1);
  if (resultCount === 0) {
    _analytics.zeroResultQueries.set(q, (_analytics.zeroResultQueries.get(q) || 0) + 1);
  }
}

// ── Index management ──────────────────────────────────────────────────────────
async function ensureIndex() {
  const exists = await client.indices.exists({ index: INDEX });
  if (!exists) {
    await client.indices.create({ index: INDEX, body: INDEX_MAPPING });
    console.log(`[Search] Created index: ${INDEX}`);
  }
}

async function deleteIndex() {
  const exists = await client.indices.exists({ index: INDEX });
  if (exists) {
    await client.indices.delete({ index: INDEX });
    console.log(`[Search] Deleted index: ${INDEX}`);
  }
}

async function reindex(prisma) {
  await deleteIndex();
  await ensureIndex();
  const batchSize = 500;
  let skip = 0;
  let total = 0;
  while (true) {
    const escrows = await prisma.escrow.findMany({
      skip,
      take: batchSize,
      include: { milestones: { select: { title: true, status: true, amount: true } } },
    });
    if (escrows.length === 0) break;
    const ops = escrows.flatMap((e) => [
      { index: { _index: INDEX, _id: String(e.id) } },
      toDocument(e),
    ]);
    await client.bulk({ body: ops, refresh: false });
    skip += batchSize;
    total += escrows.length;
  }
  await client.indices.refresh({ index: INDEX });
  console.log(`[Search] Reindexed ${total} escrows`);
  return { indexed: total };
}

// ── Document helpers ──────────────────────────────────────────────────────────
function toDocument(escrow) {
  const addresses = [
    escrow.clientAddress,
    escrow.freelancerAddress,
    escrow.arbiterAddress,
  ].filter(Boolean);
  return {
    id: String(escrow.id),
    clientAddress: escrow.clientAddress,
    freelancerAddress: escrow.freelancerAddress,
    arbiterAddress: escrow.arbiterAddress || null,
    tokenAddress: escrow.tokenAddress,
    status: escrow.status,
    totalAmount: parseFloat(escrow.totalAmount) || 0,
    remainingBalance: parseFloat(escrow.remainingBalance) || 0,
    briefHash: escrow.briefHash,
    deadline: escrow.deadline?.toISOString() || null,
    createdAt: escrow.createdAt.toISOString(),
    updatedAt: escrow.updatedAt.toISOString(),
    milestones: (escrow.milestones || []).map((m) => ({
      title: m.title,
      status: m.status,
      amount: parseFloat(m.amount) || 0,
    })),
    suggest: { input: [...addresses, String(escrow.id), escrow.status] },
  };
}

async function indexEscrow(escrow) {
  await client.index({
    index: INDEX,
    id: String(escrow.id),
    document: toDocument(escrow),
    refresh: 'wait_for',
  });
}

async function removeEscrow(escrowId) {
  await client
    .delete({ index: INDEX, id: String(escrowId), refresh: 'wait_for' })
    .catch((err) => {
      if (err?.meta?.statusCode !== 404) throw err;
    });
}


// ── Search ────────────────────────────────────────────────────────────────────
const SORTABLE = { createdAt: 'createdAt', totalAmount: 'totalAmount', status: 'status' };

async function search({
  q,
  status,
  client: clientAddr,
  freelancer,
  minAmount,
  maxAmount,
  dateFrom,
  dateTo,
  sortBy = 'createdAt',
  sortOrder = 'desc',
  page = 1,
  limit = 20,
} = {}) {
  const from = (page - 1) * limit;
  const filters = [];

  if (status) {
    const statuses = status.split(',').map((s) => s.trim()).filter(Boolean);
    filters.push({ terms: { status: statuses } });
  }
  if (clientAddr) filters.push({ term: { 'clientAddress.keyword': clientAddr } });
  if (freelancer) filters.push({ term: { 'freelancerAddress.keyword': freelancer } });
  if (minAmount !== undefined || maxAmount !== undefined) {
    const range = {};
    if (minAmount !== undefined) range.gte = parseFloat(minAmount);
    if (maxAmount !== undefined) range.lte = parseFloat(maxAmount);
    filters.push({ range: { totalAmount: range } });
  }
  if (dateFrom || dateTo) {
    const range = {};
    if (dateFrom) range.gte = dateFrom;
    if (dateTo) range.lte = dateTo;
    filters.push({ range: { createdAt: range } });
  }

  let queryClause;
  if (q && q.trim()) {
    const term = q.trim();
    queryClause = {
      bool: {
        should: [
          { term: { id: { value: term, boost: 10 } } },
          {
            multi_match: {
              query: term,
              fields: ['clientAddress^3', 'freelancerAddress^3', 'arbiterAddress'],
              type: 'best_fields',
              boost: 5,
            },
          },
          {
            multi_match: {
              query: term,
              fields: ['clientAddress', 'freelancerAddress'],
              fuzziness: 'AUTO',
              prefix_length: 3,
              boost: 2,
            },
          },
          {
            nested: {
              path: 'milestones',
              query: { match: { 'milestones.title': { query: term, fuzziness: 'AUTO' } } },
              boost: 1,
            },
          },
        ],
        minimum_should_match: 1,
        filter: filters,
      },
    };
  } else {
    queryClause = filters.length ? { bool: { filter: filters } } : { match_all: {} };
  }

  const sortField = SORTABLE[sortBy] || 'createdAt';
  const sort = [{ [sortField]: { order: sortOrder === 'asc' ? 'asc' : 'desc' } }];
  if (q) sort.unshift('_score');

  const response = await client.search({
    index: INDEX,
    from,
    size: limit,
    query: queryClause,
    sort,
    aggs: {
      by_status: { terms: { field: 'status', size: 10 } },
      amount_stats: { stats: { field: 'totalAmount' } },
      over_time: {
        date_histogram: { field: 'createdAt', calendar_interval: 'month', min_doc_count: 1 },
      },
    },
    highlight: q
      ? {
          fields: { clientAddress: {}, freelancerAddress: {}, 'milestones.title': {} },
          pre_tags: ['<mark>'],
          post_tags: ['</mark>'],
        }
      : undefined,
    track_total_hits: true,
  });

  const total =
    typeof response.hits.total === 'number' ? response.hits.total : response.hits.total.value;

  if (q) _recordQuery(q, total);

  const hits = response.hits.hits.map((hit) => ({
    ...hit._source,
    _score: hit._score,
    _highlights: hit.highlight || {},
  }));

  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  return {
    data: hits,
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
    facets: {
      status: response.aggregations?.by_status?.buckets || [],
      amountStats: response.aggregations?.amount_stats || {},
      overTime: response.aggregations?.over_time?.buckets || [],
    },
  };
}

// ── Suggestions ───────────────────────────────────────────────────────────────
async function suggest(prefix, size = 5) {
  if (!prefix || !prefix.trim()) return [];
  const response = await client.search({
    index: INDEX,
    suggest: {
      escrow_suggest: {
        prefix: prefix.trim(),
        completion: {
          field: 'suggest',
          size,
          skip_duplicates: true,
          fuzzy: { fuzziness: 1 },
        },
      },
    },
    _source: false,
  });
  return (response.suggest?.escrow_suggest?.[0]?.options || []).map((opt) => ({
    text: opt.text,
    score: opt._score,
  }));
}

// ── Public analytics ──────────────────────────────────────────────────────────
function getAnalytics() {
  const topQueries = [..._analytics.topQueries.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([query, count]) => ({ query, count }));
  const zeroResultQueries = [..._analytics.zeroResultQueries.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([query, count]) => ({ query, count }));
  return { totalSearches: _analytics.totalSearches, topQueries, zeroResultQueries };
}

async function ping() {
  return client.ping();
}

export default {
  ensureIndex,
  deleteIndex,
  reindex,
  indexEscrow,
  removeEscrow,
  search,
  suggest,
  getAnalytics,
  ping,
};
