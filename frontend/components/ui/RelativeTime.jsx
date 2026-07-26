/**
 * RelativeTime Component
 *
 * Renders a relative timestamp (e.g. "2 hours ago") using Intl.RelativeTimeFormat
 * for locale-aware output. Auto-updates every 60 seconds.
 * Shows the absolute date in a tooltip on hover.
 * Falls back to absolute date for timestamps older than 7 days.
 *
 * @param {object}   props
 * @param {string}   props.timestamp - ISO 8601 timestamp string
 * @param {string}   [props.className]
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import Tooltip from './Tooltip';

const ONE_MINUTE = 60_000;
const ONE_HOUR = 3_600_000;
const ONE_DAY = 86_400_000;
const SEVEN_DAYS = 7 * ONE_DAY;
const REFRESH_INTERVAL = 60_000;

const UNITS = [
  { max: 60_000, value: 1_000, unit: 'second' },
  { max: 3_600_000, value: 60_000, unit: 'minute' },
  { max: 86_400_000, value: 3_600_000, unit: 'hour' },
  { max: 604_800_000, value: 86_400_000, unit: 'day' },
];

function getRelativeParts(date) {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then; // positive = past

  if (diff < 0) {
    // Future date — show absolute
    return null;
  }

  const absDiff = Math.abs(diff);

  for (const { max, value, unit } of UNITS) {
    if (absDiff < max || unit === 'month') {
      return { value: -Math.round(absDiff / value), unit };
    }
  }

  return null;
}

function formatAbsolute(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelative(timestamp) {
  if (!timestamp) return '';

  const diff = Date.now() - new Date(timestamp).getTime();

  // Fall back to absolute for timestamps older than 7 days or in the future
  if (Math.abs(diff) >= SEVEN_DAYS || diff < 0) {
    return formatAbsolute(timestamp);
  }

  const parts = getRelativeParts(timestamp);

  const rtf = new Intl.RelativeTimeFormat(undefined, {
    numeric: 'auto',
    style: 'long',
  });

  return rtf.format(parts.value, parts.unit);
}

export default function RelativeTime({ timestamp, className = '' }) {
  const [label, setLabel] = useState(() => formatRelative(timestamp));

  const refresh = useCallback(() => {
    setLabel(formatRelative(timestamp));
  }, [timestamp]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [refresh]);

  if (!timestamp) return null;

  const absolute = formatAbsolute(timestamp);

  return (
    <Tooltip content={absolute}>
      <time
        dateTime={timestamp}
        className={`text-gray-400 text-sm cursor-default ${className}`}
      >
        {label}
      </time>
    </Tooltip>
  );
}
