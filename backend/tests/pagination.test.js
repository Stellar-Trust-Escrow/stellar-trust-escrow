import { buildPaginatedResponse, parsePagination } from '../lib/pagination.js';

describe('parsePagination', () => {
  it('uses the shared defaults', () => {
    expect(parsePagination({})).toEqual({
      page: 1,
      limit: 20,
      skip: 0,
    });
  });

  it('normalizes invalid numbers and caps limits', () => {
    expect(parsePagination({ page: '0', limit: '1000' })).toEqual({
      page: 1,
      limit: 100,
      skip: 0,
    });
  });
});

describe('buildPaginatedResponse', () => {
  it('returns consistent pagination metadata', () => {
    expect(buildPaginatedResponse(['a', 'b'], { page: 2, limit: 2, total: 5 })).toEqual({
      data: ['a', 'b'],
      page: 2,
      limit: 2,
      total: 5,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    });
  });

  it('handles empty result sets', () => {
    expect(buildPaginatedResponse([], { page: 1, limit: 20, total: 0 })).toEqual({
      data: [],
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    });
  });
});
