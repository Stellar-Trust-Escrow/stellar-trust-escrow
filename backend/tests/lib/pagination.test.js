import { jest } from '@jest/globals';
import { paginate, PaginationError } from '../../lib/pagination.js';

function escrow(id, createdAt) {
  return { id: BigInt(id), createdAt: new Date(createdAt) };
}

function createModel(initialRecords) {
  let records = [...initialRecords];
  const findMany = jest.fn(async ({ take, cursor, skip }) => {
    const sorted = [...records].sort(
      (a, b) => b.createdAt - a.createdAt || (b.id > a.id ? 1 : b.id < a.id ? -1 : 0),
    );
    const cursorIndex = cursor ? sorted.findIndex((record) => record.id === cursor.id) : -1;
    const start = cursorIndex >= 0 ? cursorIndex + skip : 0;
    return sorted.slice(start, start + take);
  });

  return {
    model: { findMany },
    insert(record) {
      records.push(record);
    },
  };
}

describe('paginate', () => {
  it('returns 20 of 21 records followed by the remaining record', async () => {
    const records = Array.from({ length: 21 }, (_, index) =>
      escrow(index + 1, `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`),
    );
    const { model } = createModel(records);

    const first = await paginate(model, {}, undefined, undefined, 20);
    const second = await paginate(model, {}, undefined, first.pagination.next_cursor, 20);

    expect(first.data).toHaveLength(20);
    expect(first.pagination.next_cursor).not.toBeNull();
    expect(second.data).toHaveLength(1);
    expect(second.pagination.next_cursor).toBeNull();
  });

  it('does not duplicate records when a newer record is inserted between pages', async () => {
    const records = Array.from({ length: 30 }, (_, index) =>
      escrow(index + 1, `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`),
    );
    const store = createModel(records);

    const first = await paginate(store.model, {}, undefined, undefined, 10);
    store.insert(escrow(999, '2026-02-01T00:00:00.000Z'));
    const second = await paginate(
      store.model,
      {},
      undefined,
      first.pagination.next_cursor,
      10,
    );

    const firstIds = new Set(first.data.map(({ id }) => id));
    expect(second.data.every(({ id }) => !firstIds.has(id))).toBe(true);
  });

  it('rejects an invalid base64url cursor', async () => {
    const { model } = createModel([]);

    await expect(paginate(model, {}, undefined, 'not+a+cursor', 20)).rejects.toMatchObject({
      code: 'INVALID_CURSOR',
    });
    await expect(paginate(model, {}, undefined, 'e30', 20)).rejects.toBeInstanceOf(
      PaginationError,
    );
  });

  it('paginates 50 escrows into five pages with 50 unique ids', async () => {
    const records = Array.from({ length: 50 }, (_, index) =>
      escrow(index + 1, new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString()),
    );
    const { model } = createModel(records);
    const ids = [];
    let cursor;

    do {
      const page = await paginate(model, {}, undefined, cursor, 10);
      ids.push(...page.data.map(({ id }) => id));
      cursor = page.pagination.next_cursor;
    } while (cursor);

    expect(ids).toHaveLength(50);
    expect(new Set(ids).size).toBe(50);
  });

  it('always requests one extra row with stable ordering', async () => {
    const { model } = createModel([]);

    await paginate(model, { status: 'Active' }, { status: 'asc' }, undefined, 10);

    expect(model.findMany).toHaveBeenCalledWith({
      where: { status: 'Active' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 11,
      cursor: undefined,
      skip: 0,
    });
  });

  it('decodes the cursor id as BigInt for Prisma', async () => {
    const records = [
      escrow(2, '2026-01-02T00:00:00.000Z'),
      escrow(1, '2026-01-01T00:00:00.000Z'),
    ];
    const { model } = createModel(records);
    const first = await paginate(model, {}, undefined, undefined, 1);

    await paginate(model, {}, undefined, first.pagination.next_cursor, 1);

    expect(model.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cursor: { id: 2n },
        skip: 1,
      }),
    );
  });
});
