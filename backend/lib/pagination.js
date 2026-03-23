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
