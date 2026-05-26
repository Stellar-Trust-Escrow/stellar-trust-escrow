/**
 * usePerformance Hook
 *
 * Tracks component-level render performance and provides utilities
 * for measuring async operations within components.
 *
 * @param {string} componentName — identifier for this component's metrics
 * @returns {{ measureAsync: (label, fn) => Promise, trackRender: () => void }}
 *
 * Usage:
 *   const { measureAsync } = usePerformance('DashboardPage');
 *   const data = await measureAsync('fetch-escrows', () => fetch('/api/escrows'));
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { trackCustomMetric, startMeasure } from '../lib/performance';

export function usePerformance(componentName) {
  const mountTime = useRef(performance.now());
  const hasTrackedMount = useRef(false);

  // Track time-to-interactive (mount → first paint)
  useEffect(() => {
    if (hasTrackedMount.current) return;
    hasTrackedMount.current = true;

    // requestAnimationFrame fires after the browser has painted
    requestAnimationFrame(() => {
      const duration = performance.now() - mountTime.current;
      trackCustomMetric(`${componentName}.mount`, duration);
    });
  }, [componentName]);

  /**
   * Measure an async operation's duration.
   *
   * @param {string}   label — sub-metric label
   * @param {Function} fn    — async function to measure
   * @returns {Promise<*>}   — result of fn()
   */
  const measureAsync = useCallback(
    async (label, fn) => {
      const end = startMeasure(`${componentName}.${label}`);
      try {
        const result = await fn();
        end();
        return result;
      } catch (err) {
        end();
        throw err;
      }
    },
    [componentName],
  );

  /**
   * Manually track a render cycle duration.
   * Call at the end of a render to measure how long it took.
   */
  const trackRender = useCallback(() => {
    const duration = performance.now() - mountTime.current;
    trackCustomMetric(`${componentName}.render`, duration);
  }, [componentName]);

  return { measureAsync, trackRender };
}
