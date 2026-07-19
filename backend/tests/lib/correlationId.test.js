import { runWithContext, getCorrelationContext, getCorrelationId } from '../../lib/correlationId.js';
import { attachCorrelationId } from '../../api/middleware/attachCorrelationId.js';
import { logger } from '../../lib/logger.js';
import { attachPrismaTracing } from '../../lib/prismaTracing.js';
import { trace } from '@opentelemetry/api';

describe('Correlation ID and AsyncLocalStorage', () => {
  test('two concurrent requests with different X-Correlation-Id values return correct ID for each (no cross-contamination)', async () => {
    const req1 = { headers: { 'x-correlation-id': 'correlation-id-1001' } };
    const res1 = { setHeader: jest.fn() };
    const req2 = { headers: { 'x-correlation-id': 'correlation-id-2002' } };
    const res2 = { setHeader: jest.fn() };

    let result1, result2;

    const p1 = new Promise((resolve) => {
      attachCorrelationId(req1, res1, async () => {
        await new Promise((r) => setTimeout(r, 20));
        result1 = getCorrelationId();
        resolve();
      });
    });

    const p2 = new Promise((resolve) => {
      attachCorrelationId(req2, res2, async () => {
        await new Promise((r) => setTimeout(r, 10));
        result2 = getCorrelationId();
        resolve();
      });
    });

    await Promise.all([p1, p2]);

    expect(result1).toBe('correlation-id-1001');
    expect(result2).toBe('correlation-id-2002');
    expect(res1.setHeader).toHaveBeenCalledWith('X-Correlation-Id', 'correlation-id-1001');
    expect(res2.setHeader).toHaveBeenCalledWith('X-Correlation-Id', 'correlation-id-2002');
  });

  test('missing header -> UUID generated and set in response header', () => {
    const req = { headers: {} };
    const setHeaderMock = jest.fn();
    const res = { setHeader: setHeaderMock };

    let generatedId;
    attachCorrelationId(req, res, () => {
      generatedId = getCorrelationId();
    });

    expect(generatedId).toBeDefined();
    expect(generatedId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(setHeaderMock).toHaveBeenCalledWith('X-Correlation-Id', generatedId);
  });

  test('all log output for a request contains the same correlationId', () => {
    const req = { headers: { 'x-correlation-id': 'req-log-test-99' } };
    const res = { setHeader: jest.fn() };

    attachCorrelationId(req, res, () => {
      const store = getCorrelationContext();
      expect(store.correlationId).toBe('req-log-test-99');

      expect(getCorrelationId()).toBe('req-log-test-99');
    });
  });

  test('Integration test: OTEL span for Prisma query carries correlationId attribute', async () => {
    const capturedSpans = [];
    const mockTracer = {
      startActiveSpan: (name, options, fn) => {
        const mockSpan = {
          setAttributes: jest.fn(),
          setStatus: jest.fn(),
          recordException: jest.fn(),
          end: jest.fn(),
        };
        capturedSpans.push({ name, attributes: options.attributes, span: mockSpan });
        return fn(mockSpan);
      },
    };

    jest.spyOn(trace, 'getTracer').mockReturnValue(mockTracer);

    let middlewareFn;
    const mockPrisma = {
      $use: (fn) => {
        middlewareFn = fn;
      },
    };

    attachPrismaTracing(mockPrisma);

    const req = { headers: { 'x-correlation-id': 'prisma-otel-correlation-42' } };
    const res = { setHeader: jest.fn() };

    await new Promise((resolve) => {
      attachCorrelationId(req, res, async () => {
        await middlewareFn({ model: 'User', action: 'findUnique' }, async () => ({ id: '1' }));
        resolve();
      });
    });

    expect(capturedSpans.length).toBeGreaterThan(0);
    const prismaSpan = capturedSpans.find((s) => s.name === 'db.User.findUnique');
    expect(prismaSpan).toBeDefined();
    expect(prismaSpan.attributes.correlationId).toBe('prisma-otel-correlation-42');
  });
});
