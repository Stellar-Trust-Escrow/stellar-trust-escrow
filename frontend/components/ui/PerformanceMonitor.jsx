/**
 * PerformanceMonitor — Client Component
 *
 * Invisible component that initialises Core Web Vitals tracking.
 * Mount once in the root layout — it renders nothing to the DOM.
 *
 * Usage (in app/layout.jsx):
 *   <PerformanceMonitor />
 */

'use client';

import { useEffect } from 'react';
import { reportWebVitals } from '../../lib/performance';

export default function PerformanceMonitor() {
  useEffect(() => {
    reportWebVitals();
  }, []);

  return null; // Renders nothing — purely side-effect
}
