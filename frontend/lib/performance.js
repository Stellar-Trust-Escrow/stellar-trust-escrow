/**
 * Performance Monitoring Library
 *
 * Tracks Core Web Vitals (LCP, FID, CLS, INP, TTFB) and custom metrics.
 * Reports to console in development and to an analytics endpoint in production.
 *
 * Usage:
 *   import { reportWebVitals, trackCustomMetric } from '@/lib/performance';
 *
 *   // In layout.jsx or a client component:
 *   reportWebVitals();
 *
 *   // Track custom performance marks:
 *   trackCustomMetric('escrow-list-render', 120);
 */

const IS_PROD = process.env.NODE_ENV === 'production';
const ANALYTICS_ENDPOINT = process.env.NEXT_PUBLIC_ANALYTICS_URL || null;

// ── Metric Rating Thresholds (based on Google guidelines) ─────────────────────

const THRESHOLDS = {
  LCP: { good: 2500, needsImprovement: 4000 },
  FID: { good: 100, needsImprovement: 300 },
  CLS: { good: 0.1, needsImprovement: 0.25 },
  INP: { good: 200, needsImprovement: 500 },
  TTFB: { good: 800, needsImprovement: 1800 },
  FCP: { good: 1800, needsImprovement: 3000 },
};

/**
 * Classify a metric value as 'good', 'needs-improvement', or 'poor'.
 */
function rateMetric(name, value) {
  const threshold = THRESHOLDS[name];
  if (!threshold) return 'unknown';
  if (value <= threshold.good) return 'good';
  if (value <= threshold.needsImprovement) return 'needs-improvement';
  return 'poor';
}

// ── Batched Reporting ─────────────────────────────────────────────────────────

let metricBuffer = [];
let flushTimer = null;
const FLUSH_INTERVAL = 5000; // 5 seconds

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(flushMetrics, FLUSH_INTERVAL);
}

function flushMetrics() {
  flushTimer = null;
  if (metricBuffer.length === 0) return;

  const batch = [...metricBuffer];
  metricBuffer = [];

  if (ANALYTICS_ENDPOINT) {
    // Use sendBeacon for reliability — fires even on page unload
    const payload = JSON.stringify({ metrics: batch, timestamp: Date.now() });
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(ANALYTICS_ENDPOINT, payload);
    } else {
      fetch(ANALYTICS_ENDPOINT, {
        method: 'POST',
        body: payload,
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }).catch(() => {
        // Silently ignore analytics failures
      });
    }
  }
}

/**
 * Queue a metric for batched reporting.
 */
function queueMetric(metric) {
  const entry = {
    name: metric.name,
    value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
    rating: metric.rating || rateMetric(metric.name, metric.value),
    delta: metric.delta,
    id: metric.id,
    navigationType: metric.navigationType,
    url: typeof window !== 'undefined' ? window.location.pathname : '',
    timestamp: Date.now(),
  };

  metricBuffer.push(entry);

  // Development: log to console with colour coding
  if (!IS_PROD) {
    const color =
      entry.rating === 'good'
        ? 'color: #22c55e'
        : entry.rating === 'needs-improvement'
          ? 'color: #f59e0b'
          : 'color: #ef4444';
    console.log(
      `%c[Web Vital] ${entry.name}: ${entry.value}${metric.name === 'CLS' ? ' (×1000)' : 'ms'} — ${entry.rating}`,
      color,
    );
  }

  scheduleFlush();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialise Core Web Vitals monitoring.
 * Call once from a client component (e.g. PerformanceMonitor).
 */
export async function reportWebVitals() {
  if (typeof window === 'undefined') return;

  try {
    const { onCLS, onFID, onLCP, onINP, onTTFB, onFCP } = await import('web-vitals');

    onCLS(queueMetric);
    onFID(queueMetric);
    onLCP(queueMetric);
    onINP(queueMetric);
    onTTFB(queueMetric);
    onFCP(queueMetric);
  } catch {
    // web-vitals not available — graceful degradation
    if (!IS_PROD) {
      console.warn('[Performance] web-vitals import failed; metrics disabled.');
    }
  }

  // Flush on page unload
  if (typeof window !== 'undefined') {
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flushMetrics();
      }
    });
  }
}

/**
 * Track a custom performance metric.
 *
 * @param {string} name   — metric name (e.g. 'escrow-list-render')
 * @param {number} valueMs — duration in milliseconds
 * @param {object} [extra] — additional metadata
 */
export function trackCustomMetric(name, valueMs, extra = {}) {
  const entry = {
    name: `custom.${name}`,
    value: Math.round(valueMs),
    rating: 'custom',
    ...extra,
    url: typeof window !== 'undefined' ? window.location.pathname : '',
    timestamp: Date.now(),
  };

  metricBuffer.push(entry);

  if (!IS_PROD) {
    console.log(`%c[Perf] ${name}: ${Math.round(valueMs)}ms`, 'color: #6366f1', extra);
  }

  scheduleFlush();
}

/**
 * Create a performance mark and return a function to end the measurement.
 *
 * @param {string} label — human-readable label
 * @returns {() => number} — call to end measurement; returns duration in ms
 *
 * Usage:
 *   const end = startMeasure('fetch-escrows');
 *   await fetchEscrows();
 *   const duration = end(); // logs + reports automatically
 */
export function startMeasure(label) {
  const start = performance.now();
  return () => {
    const duration = performance.now() - start;
    trackCustomMetric(label, duration);
    return duration;
  };
}

/**
 * Get a snapshot of all buffered (unsent) metrics.
 * Useful for debugging.
 */
export function getMetricSnapshot() {
  return [...metricBuffer];
}
