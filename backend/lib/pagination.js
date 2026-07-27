const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function normalizeInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function encodeCursor(offset) {
  return Buffer.from(JSON.stringify({ offset }), 'utf8').toString('base64url');
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const decoded = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    return Number.isInteger(decoded.offset) && decoded.offset >= 0 ? decoded.offset : null;
  } catch {
    return null;
  }
}

export function parsePagination(query = {}) {
  const page = Math.max(DEFAULT_PAGE, normalizeInteger(query.page, DEFAULT_PAGE));
  const limit = Math.min(MAX_LIMIT, Math.max(1, normalizeInteger(query.limit, DEFAULT_LIMIT)));
  const cursorOffset = decodeCursor(query.cursor);
  const skip = cursorOffset ?? (page - 1) * limit;

  return {
    page: cursorOffset === null ? page : Math.floor(skip / limit) + 1,
    limit,
    skip,
    cursor: query.cursor ?? null,
  };
}

export function buildPaginatedResponse(data, { page, limit, total }) {
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  const currentOffset = (page - 1) * limit;
  const nextOffset = currentOffset + limit;
  const previousOffset = Math.max(0, currentOffset - limit);

  return {
    data,
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > DEFAULT_PAGE,
    nextCursor: nextOffset < total ? encodeCursor(nextOffset) : null,
    previousCursor: currentOffset > 0 ? encodeCursor(previousOffset) : null,
  };
}

export const paginationDocs = {
  defaultPage: DEFAULT_PAGE,
  defaultLimit: DEFAULT_LIMIT,
  maxLimit: MAX_LIMIT,
};
