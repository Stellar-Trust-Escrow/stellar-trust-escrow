// Manual mock for @prisma/client with a small in-memory store.
// This lets integration-style Jest tests exercise route/service logic without
// requiring a live Prisma client or database.
import { jest } from '@jest/globals';

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function normalizeDate(value) {
  if (value instanceof Date) return value;
  return value ? new Date(value) : value;
}

function compareScalar(actual, expected) {
  if (
    expected &&
    typeof expected === 'object' &&
    !(expected instanceof Date) &&
    !Array.isArray(expected)
  ) {
    if ('in' in expected) return expected.in.includes(actual);
    if ('gt' in expected) return actual > expected.gt;
    if ('gte' in expected) return actual >= expected.gte;
    if ('lt' in expected) return actual < expected.lt;
    if ('lte' in expected) return actual <= expected.lte;
    if ('not' in expected) return !compareScalar(actual, expected.not);
  }
  return actual === expected;
}

function matchesWhere(record, where) {
  if (!where) return true;

  if (where.AND) {
    return where.AND.every((entry) => matchesWhere(record, entry));
  }

  if (where.OR) {
    return where.OR.some((entry) => matchesWhere(record, entry));
  }

  return Object.entries(where).every(([key, expected]) => {
    if (key === 'AND' || key === 'OR') return true;

    const actual = record[key];

    if (
      expected &&
      typeof expected === 'object' &&
      !Array.isArray(expected) &&
      !(expected instanceof Date)
    ) {
      if ('has' in expected) {
        return Array.isArray(actual) && actual.includes(expected.has);
      }

      if (
        'in' in expected ||
        'gt' in expected ||
        'gte' in expected ||
        'lt' in expected ||
        'lte' in expected ||
        'not' in expected
      ) {
        return compareScalar(actual, expected);
      }

      return matchesWhere(actual ?? {}, expected);
    }

    return compareScalar(actual, expected);
  });
}

function applySelect(record, select) {
  if (!select) return clone(record);

  return Object.fromEntries(
    Object.entries(select)
      .filter(([, enabled]) => enabled)
      .map(([key]) => [key, clone(record[key])]),
  );
}

function sortRecords(records, orderBy) {
  if (!orderBy) return records;

  const [[field, direction]] = Object.entries(orderBy);
  const multiplier = direction === 'desc' ? -1 : 1;

  return [...records].sort((a, b) => {
    if (a[field] < b[field]) return -1 * multiplier;
    if (a[field] > b[field]) return 1 * multiplier;
    return 0;
  });
}

function createMemoryDb() {
  return {
    tenant: [],
    user: [],
    refreshToken: [],
  };
}

function createModel(name, db) {
  let numericId = 1;
  let stringId = 1;
  let model;

  const nextId = () => {
    if (name === 'user') return numericId++;
    return `${name}_${stringId++}`;
  };

  const attachRelations = (record, include) => {
    if (!include) return clone(record);

    const result = clone(record);

    if (name === 'refreshToken' && include.user) {
      result.user = clone(db.user.find((user) => user.id === record.userId) ?? null);
    }

    return result;
  };

  const readMany = ({ where, orderBy, take, select, include } = {}) => {
    let records = db[name].filter((entry) => matchesWhere(entry, where));
    records = sortRecords(records, orderBy);
    if (typeof take === 'number') {
      records = records.slice(0, take);
    }
    return records.map((entry) => {
      const withRelations = attachRelations(entry, include);
      return select ? applySelect(withRelations, select) : withRelations;
    });
  };

  model = {
    findUnique: jest.fn(async ({ where, select, include } = {}) => {
      const record = db[name].find((entry) => matchesWhere(entry, where)) ?? null;
      if (!record) return null;
      const withRelations = attachRelations(record, include);
      return select ? applySelect(withRelations, select) : withRelations;
    }),
    findFirst: jest.fn(async ({ where, select, include, orderBy } = {}) => {
      const [record] = readMany({ where, orderBy, take: 1, select, include });
      return record ?? null;
    }),
    findFirstOrThrow: jest.fn(async (args = {}) => {
      const result = await model.findFirst(args);
      if (!result) throw new Error(`${name}.findFirstOrThrow: record not found`);
      return result;
    }),
    findMany: jest.fn(async (args = {}) => readMany(args)),
    create: jest.fn(async ({ data } = {}) => {
      const now = new Date();
      const record = {
        id: data?.id ?? nextId(),
        createdAt: data?.createdAt ?? now,
        updatedAt: data?.updatedAt ?? now,
        ...clone(data),
      };

      if (name === 'refreshToken') {
        record.expiresAt = normalizeDate(record.expiresAt);
        record.lastUsedAt = normalizeDate(record.lastUsedAt);
      }

      db[name].push(record);
      return clone(record);
    }),
    createMany: jest.fn(async ({ data } = {}) => {
      const entries = Array.isArray(data) ? data : [];
      for (const entry of entries) {
        await model.create({ data: entry });
      }
      return { count: entries.length };
    }),
    update: jest.fn(async ({ where, data } = {}) => {
      const record = db[name].find((entry) => matchesWhere(entry, where));
      if (!record) throw new Error(`${name}.update: record not found`);
      Object.assign(record, clone(data), { updatedAt: new Date() });
      if ('expiresAt' in record) record.expiresAt = normalizeDate(record.expiresAt);
      if ('lastUsedAt' in record) record.lastUsedAt = normalizeDate(record.lastUsedAt);
      return clone(record);
    }),
    updateMany: jest.fn(async ({ where, data } = {}) => {
      let count = 0;
      for (const record of db[name]) {
        if (!matchesWhere(record, where)) continue;
        Object.assign(record, clone(data), { updatedAt: new Date() });
        if ('expiresAt' in record) record.expiresAt = normalizeDate(record.expiresAt);
        if ('lastUsedAt' in record) record.lastUsedAt = normalizeDate(record.lastUsedAt);
        count++;
      }
      return { count };
    }),
    upsert: jest.fn(async ({ where, update, create } = {}) => {
      const existing = db[name].find((entry) => matchesWhere(entry, where));
      if (existing) {
        Object.assign(existing, clone(update), { updatedAt: new Date() });
        return clone(existing);
      }
      return model.create({ data: create });
    }),
    delete: jest.fn(async ({ where } = {}) => {
      const index = db[name].findIndex((entry) => matchesWhere(entry, where));
      if (index === -1) throw new Error(`${name}.delete: record not found`);
      const [record] = db[name].splice(index, 1);
      return clone(record);
    }),
    deleteMany: jest.fn(async ({ where } = {}) => {
      const kept = [];
      let count = 0;
      for (const record of db[name]) {
        if (matchesWhere(record, where)) {
          count++;
        } else {
          kept.push(record);
        }
      }
      db[name] = kept;
      return { count };
    }),
    count: jest.fn(
      async ({ where } = {}) => db[name].filter((entry) => matchesWhere(entry, where)).length,
    ),
    aggregate: jest.fn().mockResolvedValue({}),
    groupBy: jest.fn().mockResolvedValue([]),
  };

  return model;
}

function createClient() {
  const db = createMemoryDb();
  const models = new Map();

  const getModel = (name) => {
    if (!models.has(name)) {
      models.set(name, createModel(name, db));
    }
    return models.get(name);
  };

  const client = {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $transaction: jest.fn(async (ops) => (Array.isArray(ops) ? Promise.all(ops) : ops(client))),
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(0),
    $on: jest.fn(),
    $use: jest.fn(),
    $extends: jest.fn().mockReturnThis(),
  };

  return new Proxy(client, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === '__esModule') return true;
      if (prop === 'then') return undefined;
      return getModel(prop);
    },
  });
}

export class PrismaClient {
  constructor() {
    return createClient();
  }
}

export default { PrismaClient };
