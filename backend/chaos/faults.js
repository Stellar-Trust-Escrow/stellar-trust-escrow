/**
 * Fault Injectors
 *
 * Each injector monkey-patches a module or intercepts a network call to
 * simulate a specific infrastructure failure. All injectors return a
 * `restore()` function that reverts the patch.
 *
 * @module chaos/faults
 */

import { createClient } from 'redis';

// ── DB disconnect ─────────────────────────────────────────────────────────────

/**
 * Simulates a database connection drop by replacing prisma.$queryRaw and
 * prisma.$executeRaw with functions that throw a connection error.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {number} [durationMs=5000] — how long to keep the fault active
 * @returns {{ restore: Function }}
 */
export function injectDbDisconnect(prisma, durationMs = 5_000) {
  const origQueryRaw = prisma.$queryRaw.bind(prisma);
  const origExecuteRaw = prisma.$executeRaw.bind(prisma);

  const err = Object.assign(new Error('Connection terminated unexpectedly'), {
    code: 'P1001',
    meta: { chaos: true },
  });

  prisma.$queryRaw = async () => {
    throw err;
  };
  prisma.$executeRaw = async () => {
    throw err;
  };

  // Also patch findMany / findUnique / create / update / delete on all models
  const modelNames = Object.keys(prisma).filter((k) => !k.startsWith('$') && !k.startsWith('_'));
  const origModelMethods = {};
  for (const model of modelNames) {
    origModelMethods[model] = {};
    for (const method of [
      'findMany',
      'findUnique',
      'findFirst',
      'create',
      'update',
      'delete',
      'count',
      'upsert',
    ]) {
      if (typeof prisma[model]?.[method] === 'function') {
        origModelMethods[model][method] = prisma[model][method].bind(prisma[model]);
        prisma[model][method] = async () => {
          throw err;
        };
      }
    }
  }

  const timer = setTimeout(() => restore(), durationMs);

  function restore() {
    clearTimeout(timer);
    prisma.$queryRaw = origQueryRaw;
    prisma.$executeRaw = origExecuteRaw;
    for (const model of modelNames) {
      for (const [method, orig] of Object.entries(origModelMethods[model] ?? {})) {
        prisma[model][method] = orig;
      }
    }
  }

  return { restore };
}

// ── Redis timeout ─────────────────────────────────────────────────────────────

/**
 * Simulates Redis cache lookup timeouts by replacing the redis client's
 * `get` command with a function that hangs for `lagMs` before resolving null.
 *
 * @param {import('redis').RedisClientType} redisClient
 * @param {number} [lagMs=3000]
 * @param {number} [durationMs=5000]
 * @returns {{ restore: Function }}
 */
export function injectRedisTimeout(redisClient, lagMs = 3_000, durationMs = 5_000) {
  const origGet = redisClient.get.bind(redisClient);
  const origSet = redisClient.set.bind(redisClient);

  redisClient.get = (_key) => new Promise((resolve) => setTimeout(() => resolve(null), lagMs));
  redisClient.set = (_key, _val, _opts) =>
    new Promise((resolve) => setTimeout(() => resolve('OK'), lagMs));

  const timer = setTimeout(() => restore(), durationMs);

  function restore() {
    clearTimeout(timer);
    redisClient.get = origGet;
    redisClient.set = origSet;
  }

  return { restore };
}

// ── Stellar RPC lag ───────────────────────────────────────────────────────────

/**
 * Simulates a slow Stellar RPC node by intercepting global `fetch` and
 * adding artificial latency to requests matching `rpcUrl`.
 *
 * @param {string} rpcUrl — URL prefix to match (e.g. 'https://soroban-testnet')
 * @param {number} [lagMs=4000]
 * @param {number} [durationMs=8000]
 * @returns {{ restore: Function }}
 */
export function injectRpcLag(rpcUrl, lagMs = 4_000, durationMs = 8_000) {
  const origFetch = globalThis.fetch;

  globalThis.fetch = async (url, opts) => {
    if (String(url).startsWith(rpcUrl)) {
      await new Promise((r) => setTimeout(r, lagMs));
    }
    return origFetch(url, opts);
  };

  const timer = setTimeout(() => restore(), durationMs);

  function restore() {
    clearTimeout(timer);
    globalThis.fetch = origFetch;
  }

  return { restore };
}

// ── Duplicate transaction ─────────────────────────────────────────────────────

/**
 * Simulates a duplicate transaction submission by calling the provided
 * `submitFn` twice with the same arguments and returning both results.
 * The caller should assert that the second call is idempotent.
 *
 * @param {Function} submitFn — async function that submits a transaction
 * @param {...any} args — arguments to pass to submitFn
 * @returns {Promise<[any, any]>} [firstResult, secondResult]
 */
export async function injectDuplicateTransaction(submitFn, ...args) {
  const [first, second] = await Promise.allSettled([submitFn(...args), submitFn(...args)]);
  return [first, second];
}
