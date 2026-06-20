/**
 * RPC SLA Monitor
 *
 * Polls all configured Soroban/Horizon RPC endpoints every POLL_INTERVAL_MS.
 * Tracks per-endpoint latency, success rate, and sync lag.
 * Emits alerts (console, Slack, PagerDuty) when thresholds are breached.
 * Exports Prometheus metrics consumed by the existing /metrics route.
 *
 * Env vars:
 *   RPC_MONITOR_ENDPOINTS        — comma-separated list of RPC URLs to monitor
 *   RPC_MONITOR_POLL_INTERVAL_MS — poll cadence (default: 10 000)
 *   RPC_LATENCY_THRESHOLD_MS     — alert threshold in ms (default: 1 500)
 *   RPC_FAILURE_RATE_THRESHOLD   — alert threshold 0–1 (default: 0.02)
 *   RPC_ALERT_WINDOW             — number of recent probes used for rate calc (default: 50)
 *   SLACK_RPC_WEBHOOK            — Slack incoming webhook URL (optional)
 *   PAGERDUTY_ROUTING_KEY        — PagerDuty Events API v2 key (optional)
 */

import client from 'prom-client';
import { createModuleLogger } from '../config/logger.js';
import { register } from '../lib/metrics.js';

const logger = createModuleLogger('monitoring.rpcMonitor');

// ── Config ────────────────────────────────────────────────────────────────────

const configuredEndpoints =
  process.env.RPC_MONITOR_ENDPOINTS ??
  process.env.SOROBAN_RPC_URL ??
  (process.env.NODE_ENV === 'test' ? '' : 'https://soroban-testnet.stellar.org');
const ENDPOINTS = configuredEndpoints
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean);

const POLL_INTERVAL_MS = parseInt(process.env.RPC_MONITOR_POLL_INTERVAL_MS || '10000', 10);
const LATENCY_THRESHOLD_MS = parseInt(process.env.RPC_LATENCY_THRESHOLD_MS || '1500', 10);
const FAILURE_RATE_THRESHOLD = parseFloat(process.env.RPC_FAILURE_RATE_THRESHOLD || '0.02');
const ALERT_WINDOW = parseInt(process.env.RPC_ALERT_WINDOW || '50', 10);
const SLACK_WEBHOOK = process.env.SLACK_RPC_WEBHOOK;
const PAGERDUTY_KEY = process.env.PAGERDUTY_ROUTING_KEY;

// ── Prometheus metrics ────────────────────────────────────────────────────────

const rpcLatency = new client.Histogram({
  name: 'rpc_probe_latency_ms',
  help: 'Latency of RPC health probes in milliseconds',
  labelNames: ['endpoint'],
  buckets: [50, 100, 250, 500, 750, 1000, 1500, 2500, 5000],
  registers: [register],
});

const rpcProbeTotal = new client.Counter({
  name: 'rpc_probes_total',
  help: 'Total RPC probe attempts',
  labelNames: ['endpoint', 'result'], // result: success | failure
  registers: [register],
});

const rpcSyncLag = new client.Gauge({
  name: 'rpc_sync_lag_ledgers',
  help: 'Ledger sync lag between primary and this endpoint',
  labelNames: ['endpoint'],
  registers: [register],
});

const rpcEndpointUp = new client.Gauge({
  name: 'rpc_endpoint_up',
  help: '1 if endpoint is currently healthy, 0 otherwise',
  labelNames: ['endpoint'],
  registers: [register],
});

const rpcAlertsTotal = new client.Counter({
  name: 'rpc_alerts_total',
  help: 'Total SLA alerts emitted',
  labelNames: ['endpoint', 'reason'], // reason: latency | failure_rate
  registers: [register],
});

// ── Per-endpoint state ────────────────────────────────────────────────────────

class EndpointState {
  constructor(url) {
    this.url = url;
    /** @type {boolean[]} — sliding window of probe outcomes */
    this._window = [];
    this._alertedLatency = false;
    this._alertedFailureRate = false;
  }

  record(success) {
    this._window.push(success);
    if (this._window.length > ALERT_WINDOW) this._window.shift();
  }

  failureRate() {
    if (!this._window.length) return 0;
    const failures = this._window.filter((v) => !v).length;
    return failures / this._window.length;
  }
}

const states = new Map(ENDPOINTS.map((url) => [url, new EndpointState(url)]));

// ── Alert channels ────────────────────────────────────────────────────────────

async function sendSlack(text) {
  if (!SLACK_WEBHOOK) return;
  try {
    await fetch(SLACK_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    logger.warn({ message: 'slack_alert_failed', error: err.message });
  }
}

async function sendPagerDuty(summary, severity = 'error') {
  if (!PAGERDUTY_KEY) return;
  try {
    await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routing_key: PAGERDUTY_KEY,
        event_action: 'trigger',
        payload: {
          summary,
          severity,
          source: 'stellar-trust-escrow/rpcMonitor',
          timestamp: new Date().toISOString(),
        },
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    logger.warn({ message: 'pagerduty_alert_failed', error: err.message });
  }
}

async function emitAlert(endpoint, reason, detail) {
  const msg = `[RPC Alert] ${reason} on ${endpoint}: ${detail}`;
  logger.warn({ message: 'rpc_sla_breach', endpoint, reason, detail });
  rpcAlertsTotal.inc({ endpoint, reason });
  await Promise.all([sendSlack(`:warning: ${msg}`), sendPagerDuty(msg)]);
}

// ── Probe logic ───────────────────────────────────────────────────────────────

async function probe(url) {
  const state = states.get(url);
  const t0 = Date.now();

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestLedger', params: [] }),
      signal: AbortSignal.timeout(LATENCY_THRESHOLD_MS * 2),
    });

    const latency = Date.now() - t0;

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);

    const ledger = json.result?.sequence ?? 0;

    rpcLatency.observe({ endpoint: url }, latency);
    rpcProbeTotal.inc({ endpoint: url, result: 'success' });
    rpcEndpointUp.set({ endpoint: url }, 1);
    state.record(true);

    // Latency threshold alert
    if (latency > LATENCY_THRESHOLD_MS) {
      if (!state._alertedLatency) {
        state._alertedLatency = true;
        await emitAlert(url, 'latency', `${latency}ms > ${LATENCY_THRESHOLD_MS}ms`);
      }
    } else {
      state._alertedLatency = false;
    }

    return { url, ok: true, latency, ledger };
  } catch (err) {
    const latency = Date.now() - t0;
    rpcProbeTotal.inc({ endpoint: url, result: 'failure' });
    rpcEndpointUp.set({ endpoint: url }, 0);
    state.record(false);

    const rate = state.failureRate();
    if (rate > FAILURE_RATE_THRESHOLD && !state._alertedFailureRate) {
      state._alertedFailureRate = true;
      await emitAlert(
        url,
        'failure_rate',
        `${(rate * 100).toFixed(1)}% > ${(FAILURE_RATE_THRESHOLD * 100).toFixed(1)}%`,
      );
    } else if (rate <= FAILURE_RATE_THRESHOLD) {
      state._alertedFailureRate = false;
    }

    logger.warn({ message: 'rpc_probe_failed', endpoint: url, error: err.message, latency });
    return { url, ok: false, latency, error: err.message };
  }
}

// ── Sync lag tracking ─────────────────────────────────────────────────────────

async function updateSyncLag(results) {
  const successful = results.filter((r) => r.ok && r.ledger);
  if (successful.length < 2) return;
  const maxLedger = Math.max(...successful.map((r) => r.ledger));
  for (const r of successful) {
    rpcSyncLag.set({ endpoint: r.url }, maxLedger - r.ledger);
  }
}

// ── Main poll loop ────────────────────────────────────────────────────────────

async function poll() {
  const results = await Promise.all(ENDPOINTS.map(probe));
  await updateSyncLag(results);

  logger.info({
    message: 'rpc_poll_complete',
    results: results.map(({ url, ok, latency }) => ({ url, ok, latency })),
  });
}

export function startRpcMonitor() {
  if (!ENDPOINTS.length) {
    logger.warn({ message: 'rpc_monitor_no_endpoints' });
    return;
  }

  logger.info({
    message: 'rpc_monitor_started',
    endpoints: ENDPOINTS,
    pollIntervalMs: POLL_INTERVAL_MS,
  });

  // Initialise gauges to avoid gaps in Prometheus scrapes
  for (const url of ENDPOINTS) {
    rpcEndpointUp.set({ endpoint: url }, 1);
    rpcSyncLag.set({ endpoint: url }, 0);
  }

  poll().catch((err) => logger.error({ message: 'rpc_poll_error', error: err.message }));
  const timer = setInterval(
    () => poll().catch((err) => logger.error({ message: 'rpc_poll_error', error: err.message })),
    POLL_INTERVAL_MS,
  );
  timer.unref?.();
}

export default { startRpcMonitor };
