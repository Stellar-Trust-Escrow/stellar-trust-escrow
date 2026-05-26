'use client';

import { useState, useEffect } from 'react';
import { formatRelativeTime } from '../lib/formatRelativeTime';

/**
 * Returns a relative time string (e.g. "2 minutes ago") for the given date,
 * automatically refreshing every `intervalMs` milliseconds.
 *
 * @param {Date|number|null} date
 * @param {number} intervalMs — how often to recompute (default: 60 000 ms)
 * @returns {string}
 */
export function useRelativeTime(date, intervalMs = 60_000) {
  const [label, setLabel] = useState(() => formatRelativeTime(date));

  useEffect(() => {
    setLabel(formatRelativeTime(date));

    if (!date) return;

    const id = setInterval(() => {
      setLabel(formatRelativeTime(date));
    }, intervalMs);

    return () => clearInterval(id);
  }, [date, intervalMs]);

  return label;
}
