const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function normalizeInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function parsePagination(query = {}) {
  const page = Math.max(DEFAULT_PAGE, normalizeInteger(query.page, DEFAULT_PAGE));
  const limit = Math.min(MAX_LIMIT, Math.max(1, normalizeInteger(query.limit, DEFAULT_LIMIT)));

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

export function buildPaginatedResponse(data, { page, limit, total }) {
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  return {
    data,
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > DEFAULT_PAGE,
  };
}

export const paginationDocs = {
  defaultPage: DEFAULT_PAGE,
  defaultLimit: DEFAULT_LIMIT,
  maxLimit: MAX_LIMIT,
};

// ── Cursor-based pagination ───────────────────────────────────────────────────
//
// Offset pagination (LIMIT n OFFSET k) requires Postgres to scan and discard
// k rows before returning results, making deep pages O(n). Cursor pagination
// instead starts the scan from the last-seen row's cursor value, giving O(1)
// per-page cost regardless of depth.
//
// Usage:
//   const { take, cursor } = parseCursorPagination(req.query);
//   const rows = await prisma.escrow.findMany({
//     take,
//     ...(cursor ? { cursor: { id: BigInt(cursor) }, skip: 1 } : {}),
//     orderBy: { id: 'desc' },
//   });
//   res.json(buildCursorResponse(rows, take, 'id'));

export function parseCursorPagination(query = {}) {
  const take = Math.min(MAX_LIMIT, Math.max(1, normalizeInteger(query.limit, DEFAULT_LIMIT)));
  const cursor =
    typeof query.cursor === 'string' && query.cursor.trim() ? query.cursor.trim() : null;
  return { take, cursor };
}

/**
 * Builds a cursor-paged response envelope.
 *
 * @template T
 * @param {T[]} data      — The page of records returned from the DB
 * @param {number} take   — The requested page size (from parseCursorPagination)
 * @param {keyof T} field — The field used as cursor (must be sortable & unique)
 * @returns {{ data: T[], nextCursor: string | null, hasNextPage: boolean }}
 */
export function buildCursorResponse(data, take, field) {
  const hasNextPage = data.length === take;
  const nextCursor = hasNextPage ? String(data[data.length - 1][field]) : null;
  return { data, nextCursor, hasNextPage };
}

export class PaginationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'PaginationError';
    this.code = code;
    this.statusCode = 400;
  }
}

function encodeCursor(record) {
  return Buffer.from(
    JSON.stringify({
      id: String(record.id),
      createdAt: new Date(record.createdAt).toISOString(),
    }),
  ).toString('base64url');
}

function decodeCursor(cursor) {
  if (cursor === undefined || cursor === null || cursor === '') return null;

  try {
    if (typeof cursor !== 'string' || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
      throw new Error('Cursor is not base64url encoded');
    }

    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const createdAt = new Date(decoded?.createdAt);

    if (
      typeof decoded?.id !== 'string' ||
      !/^\d+$/.test(decoded.id) ||
      typeof decoded?.createdAt !== 'string' ||
      Number.isNaN(createdAt.getTime())
    ) {
      throw new Error('Cursor payload is invalid');
    }

    return {
      ...decoded,
      id: BigInt(decoded.id),
    };
  } catch {
    throw new PaginationError('Invalid pagination cursor', 'INVALID_CURSOR');
  }
}

export async function paginate(model, where = {}, orderBy, cursor, limit = DEFAULT_LIMIT) {
  void orderBy;
  const decoded = decodeCursor(cursor);
  const stableOrderBy = [{ createdAt: 'desc' }, { id: 'desc' }];

  const results = await model.findMany({
    where,
    orderBy: stableOrderBy,
    take: limit + 1,
    cursor: decoded ? { id: decoded.id } : undefined,
    skip: decoded ? 1 : 0,
  });

  const hasNextPage = results.length > limit;
  if (hasNextPage) results.pop();

  return {
    data: results,
    pagination: {
      next_cursor:
        hasNextPage && results.length > 0 ? encodeCursor(results[results.length - 1]) : null,
      limit,
    },
  };
}
