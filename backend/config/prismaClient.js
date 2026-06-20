/**
 * Prisma client factory with read-replica routing.
 * Exports a proxy Prisma instance that routes read operations to replicas.
 */
import { PrismaClient } from '@prisma/client';
import { attachConnectionMonitoring } from '../lib/connectionMonitor.js';
import { attachRetryMiddleware } from '../lib/retryUtils.js';

const replicaUrls = (process.env.READ_REPLICA_URLS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const primaryUrl = process.env.DATABASE_URL;

function createClientFor(url) {
  const client = new PrismaClient({ datasources: url ? { db: { url } } : undefined });
  attachConnectionMonitoring(client);
  attachRetryMiddleware(client);
  return client;
}

const primary = createClientFor(primaryUrl);
const replicas = replicaUrls.length ? replicaUrls.map(createClientFor) : [];

let rrIndex = 0;
function pickReplica() {
  if (replicas.length === 0) return primary;
  const client = replicas[rrIndex % replicas.length];
  rrIndex += 1;
  return client;
}

const READ_OPS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);

/**
 * Create a proxy that routes model operations to the primary or a replica.
 * Usage: import prisma from '../config/prismaClient.js'; await prisma.user.findMany(...)
 */
const routedPrisma = new Proxy(
  {},
  {
    get(_, modelName) {
      // return a proxy for the model
      return new Proxy(
        {},
        {
          get(_, opName) {
            return async (args) => {
              const op = String(opName);
              const client = READ_OPS.has(op) ? pickReplica() : primary;
               
              if (!client[modelName] || !client[modelName][op]) {
                throw new Error(`Prisma client does not support ${String(modelName)}.${op}`);
              }
              return client[modelName][op](args);
            };
          },
        },
      );
    },
  },
);

export { primary, replicas };
export default routedPrisma;
