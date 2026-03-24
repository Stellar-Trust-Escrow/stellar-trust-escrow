/**
 * OpenTelemetry Distributed Tracing
 *
 * Initialises the OTel SDK with:
 *  - OTLP/HTTP exporter → Jaeger (or any OTLP-compatible backend)
 *  - Auto-instrumentation for HTTP, Express, and fetch
 *  - W3C TraceContext + Baggage propagators
 *
 * MUST be imported before any other module in server.js so that
 * auto-instrumentation patches are applied at startup.
 *
 * Environment variables:
 *  OTEL_EXPORTER_OTLP_ENDPOINT  — default: http://localhost:4318
 *  OTEL_SERVICE_NAME            — default: stellar-trust-escrow
 *  OTEL_ENVIRONMENT             — default: development
 *  TRACING_ENABLED              — set to "false" to disable (e.g. in tests)
 *
 * @module lib/tracing
 */

/* eslint-disable no-undef */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_DEPLOYMENT_ENVIRONMENT } from '@opentelemetry/semantic-conventions';
import { W3CTraceContextPropagator, CompositePropagator, W3CBaggagePropagator } from '@opentelemetry/core';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { trace, context, SpanStatusCode, propagation } from '@opentelemetry/api';

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'stellar-trust-escrow';
const ENVIRONMENT = process.env.OTEL_ENVIRONMENT || process.env.NODE_ENV || 'development';
const OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';
const TRACING_ENABLED = process.env.TRACING_ENABLED !== 'false';

let sdk = null;

/**
 * Initialise and start the OTel SDK.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function initTracing() {
  if (!TRACING_ENABLED || sdk) return;

  const exporter = new OTLPTraceExporter({
    url: `${OTLP_ENDPOINT}/v1/traces`,
    headers: {},
  });

  sdk = new NodeSDK({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: SERVICE_NAME,
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: ENVIRONMENT,
    }),
    traceExporter: exporter,
    spanProcessor: new BatchSpanProcessor(exporter, {
      maxQueueSize: 512,
      scheduledDelayMillis: 2000,
    }),
    textMapPropagator: new CompositePropagator({
      propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false }, // too noisy
        '@opentelemetry/instrumentation-http': { enabled: true },
        '@opentelemetry/instrumentation-express': { enabled: true },
      }),
    ],
  });

  sdk.start();
  console.log(`[Tracing] OpenTelemetry started → ${OTLP_ENDPOINT} (service: ${SERVICE_NAME})`);

  process.on('SIGTERM', () => shutdownTracing());
  process.on('SIGINT', () => shutdownTracing());
}

/** Flush and shut down the SDK gracefully. */
export async function shutdownTracing() {
  if (!sdk) return;
  try {
    await sdk.shutdown();
    console.log('[Tracing] SDK shut down cleanly');
  } catch (err) {
    console.error('[Tracing] Error during shutdown:', err.message);
  }
}

/**
 * Returns the tracer for a given instrumentation scope.
 * @param {string} [name] - scope name, defaults to service name
 */
export function getTracer(name = SERVICE_NAME) {
  return trace.getTracer(name, '1.0.0');
}

/**
 * Wraps an async function in a named span.
 * Automatically records exceptions and sets error status.
 *
 * @param {string} spanName
 * @param {object} [attributes] - initial span attributes
 * @param {Function} fn - async function receiving the active span
 * @returns {Promise<*>}
 *
 * @example
 * const result = await withSpan('stellarService.submitTransaction', { 'tx.hash': hash }, async (span) => {
 *   // ... do work
 *   return result;
 * });
 */
export async function withSpan(spanName, attributes = {}, fn) {
  if (!TRACING_ENABLED) return fn({ setAttribute: () => {}, setStatus: () => {}, recordException: () => {} });

  const tracer = getTracer();
  return tracer.startActiveSpan(spanName, { attributes }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Injects the current trace context into a headers object (for outbound HTTP).
 * @param {object} headers - mutable headers map
 */
export function injectTraceContext(headers) {
  propagation.inject(context.active(), headers);
}

/**
 * Extracts trace context from incoming headers and returns an OTel Context.
 * @param {object} headers
 */
export function extractTraceContext(headers) {
  return propagation.extract(context.active(), headers);
}

export { SpanStatusCode, trace, context };
