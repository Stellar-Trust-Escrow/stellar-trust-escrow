import { jest } from '@jest/globals';

// ── Mock searchService ────────────────────────────────────────────────────────

const searchServiceMock = {
  search: jest.fn(),
  suggest: jest.fn(),
  getAnalytics: jest.fn(),
  reindex: jest.fn(),
};

const prismaMock = {};

jest.unstable_mockModule('../services/searchService.js', () => ({
  default: searchServiceMock,
}));

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const { default: searchController } = await import('../api/controllers/searchController.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function createRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

beforeEach(() => jest.clearAllMocks());

// ── searchEscrows ─────────────────────────────────────────────────────────────

describe('searchController.searchEscrows', () => {
  const mockResult = {
    data: [{ id: '1', clientAddress: 'GABC', status: 'Active' }],
    page: 1,
    limit: 20,
    total: 1,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
    facets: { status: [], amountStats: {}, overTime: [] },
  };

  it('returns search results with default pagination', async () => {
    searchServiceMock.search.mockResolvedValue(mockResult);

    const req = { query: { q: 'GABC' } };
    const res = createRes();
    await searchController.searchEscrows(req, res);

    expect(searchServiceMock.search).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'GABC', page: 1, limit: 20 }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(mockResult);
  });

  it('passes filters through to the service', async () => {
    searchServiceMock.search.mockResolvedValue(mockResult);

    const req = {
      query: {
        q: 'test',
        status: 'Active,Completed',
        client: 'GABC',
        freelancer: 'GXYZ',
        minAmount: '100',
        maxAmount: '500',
        dateFrom: '2025-01-01',
        dateTo: '2025-12-31',
        sortBy: 'totalAmount',
        sortOrder: 'asc',
        page: '2',
        limit: '10',
      },
    };
    const res = createRes();
    await searchController.searchEscrows(req, res);

    expect(searchServiceMock.search).toHaveBeenCalledWith(
      expect.objectContaining({
        q: 'test',
        status: 'Active,Completed',
        client: 'GABC',
        freelancer: 'GXYZ',
        minAmount: 100,
        maxAmount: 500,
        dateFrom: '2025-01-01',
        dateTo: '2025-12-31',
        sortBy: 'totalAmount',
        sortOrder: 'asc',
        page: 2,
        limit: 10,
      }),
    );
  });

  it('falls back to safe defaults for invalid sortBy/sortOrder', async () => {
    searchServiceMock.search.mockResolvedValue(mockResult);

    const req = { query: { sortBy: 'injected', sortOrder: 'INVALID' } };
    const res = createRes();
    await searchController.searchEscrows(req, res);

    expect(searchServiceMock.search).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'createdAt', sortOrder: 'desc' }),
    );
  });

  it('returns 500 when the service throws', async () => {
    searchServiceMock.search.mockRejectedValue(new Error('ES down'));

    const res = createRes();
    await searchController.searchEscrows({ query: {} }, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ error: 'Search unavailable' });
  });
});

// ── getSuggestions ────────────────────────────────────────────────────────────

describe('searchController.getSuggestions', () => {
  it('returns suggestions for a valid prefix', async () => {
    searchServiceMock.suggest.mockResolvedValue([{ text: 'GABC', score: 1 }]);

    const req = { query: { q: 'GA', size: '3' } };
    const res = createRes();
    await searchController.getSuggestions(req, res);

    expect(searchServiceMock.suggest).toHaveBeenCalledWith('GA', 3);
    expect(res.body).toEqual({ suggestions: [{ text: 'GABC', score: 1 }] });
  });

  it('returns 400 when q is missing', async () => {
    const res = createRes();
    await searchController.getSuggestions({ query: {} }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: 'q is required' });
    expect(searchServiceMock.suggest).not.toHaveBeenCalled();
  });

  it('returns 400 when q is only whitespace', async () => {
    const res = createRes();
    await searchController.getSuggestions({ query: { q: '   ' } }, res);

    expect(res.statusCode).toBe(400);
  });

  it('caps size at 20', async () => {
    searchServiceMock.suggest.mockResolvedValue([]);

    const req = { query: { q: 'G', size: '999' } };
    const res = createRes();
    await searchController.getSuggestions(req, res);

    expect(searchServiceMock.suggest).toHaveBeenCalledWith('G', 20);
  });

  it('returns 500 when the service throws', async () => {
    searchServiceMock.suggest.mockRejectedValue(new Error('ES down'));

    const res = createRes();
    await searchController.getSuggestions({ query: { q: 'G' } }, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ error: 'Suggestions unavailable' });
  });
});

// ── getAnalytics ──────────────────────────────────────────────────────────────

describe('searchController.getAnalytics', () => {
  it('returns analytics data', () => {
    const mockAnalytics = {
      totalSearches: 42,
      topQueries: [{ query: 'GABC', count: 10 }],
      zeroResultQueries: [],
    };
    searchServiceMock.getAnalytics.mockReturnValue(mockAnalytics);

    const res = createRes();
    searchController.getAnalytics({}, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(mockAnalytics);
  });
});

// ── reindex ───────────────────────────────────────────────────────────────────

describe('searchController.reindex', () => {
  it('returns indexed count on success', async () => {
    searchServiceMock.reindex.mockResolvedValue({ indexed: 150 });

    const res = createRes();
    await searchController.reindex({}, res);

    expect(searchServiceMock.reindex).toHaveBeenCalledWith(prismaMock);
    expect(res.body).toMatchObject({ message: 'Reindex complete', indexed: 150 });
  });

  it('returns 500 when reindex fails', async () => {
    searchServiceMock.reindex.mockRejectedValue(new Error('index error'));

    const res = createRes();
    await searchController.reindex({}, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ error: 'Reindex failed' });
  });
});
