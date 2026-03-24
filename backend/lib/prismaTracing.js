/**
 * Prisma Distributed Tracing
 *
 * Attaches a Prisma middleware that creates an OTel child span for every
 * database query, recording model, operation, and duration.
 *
 * Works alongside prismaMetrics.js — both middlewares can be attached.
 *
 * @module lib/prismaTracing
 */

/* eslint-disable no-undef */
import { getTracer } from './tracing.js';
import { SpanStatusCode } from '@opentelemetry/api';

const SLOW_QUERY_THRESHOLD_MS = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || '200');

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export function attachPrismaTracing(prisma) {
  prisma.$use(async (params, next) => {
    const tracer = getTracer('prisma');
    const spanName = `db.${params.model ?? 'unknown'}.${params.action ?? 'unknown'}`;

    return tracer.startActiveSpan(
      spanName,
      {
        attributes: {
          'db.system': 'postgresql',
          'db.operation': params.action ?? 'unknown',
          'db.sql.table': params.model ?? 'unknown',
        },
      },
      async (span) => {
        const start = Date.now();
        try {
          const result = await next(params);
          const durationMs = Date.now() - start;

          span.setAttributes({
            'db.duration_ms': durationMs,
            'db.slow_query': durationMs > SLOW_QUERY_THRESHOLD_MS,
          });
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (err) {
          span.recordException(err);
          span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          throw err;
        } finally {
          span.end();
        }
      },
    );
  });
}
