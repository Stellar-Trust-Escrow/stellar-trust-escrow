'use client';

/**
 * MilestoneGantt — Interactive Gantt chart for escrow milestones
 *
 * Displays milestones as horizontal bars on a calendar timeline.
 * No external chart library — pure SVG/CSS for zero bundle overhead.
 *
 * Features:
 * - Responsive timeline scaled to milestone date range
 * - Status-colored bars with completion percentage fill
 * - Hover tooltips with milestone details and amount
 * - Keyboard accessible (Tab to focus bars, Enter/Space for tooltip)
 * - Screen reader friendly with aria-labels
 *
 * @param {object}   props
 * @param {Array}    props.milestones  — array of Milestone objects
 * @param {string}   [props.startDate] — ISO date string for timeline start
 * @param {string}   [props.endDate]   — ISO date string for timeline end
 * @param {string}   [props.className]
 */

import { useState, useMemo, useRef, useEffect } from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────

const ROW_HEIGHT = 44;
const ROW_GAP = 8;
const LABEL_WIDTH = 140;
const MIN_BAR_WIDTH = 8;
const HEADER_HEIGHT = 40;

const STATUS_COLORS = {
  Pending:   { bar: '#4b5563', fill: '#6b7280', text: '#9ca3af' },
  Submitted: { bar: '#1d4ed8', fill: '#3b82f6', text: '#93c5fd' },
  Approved:  { bar: '#065f46', fill: '#10b981', text: '#6ee7b7' },
  Released:  { bar: '#065f46', fill: '#34d399', text: '#a7f3d0' },
  Rejected:  { bar: '#7f1d1d', fill: '#ef4444', text: '#fca5a5' },
  Disputed:  { bar: '#78350f', fill: '#f59e0b', text: '#fde68a' },
};

const COMPLETION = { Pending: 0, Submitted: 40, Approved: 80, Released: 100, Rejected: 0, Disputed: 20 };

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

function formatDate(d) {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatAmount(amount) {
  const n = Number(amount) / 10_000_000;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' USDC';
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function Tooltip({ milestone, x, y, visible }) {
  if (!visible) return null;
  const colors = STATUS_COLORS[milestone.status] ?? STATUS_COLORS.Pending;
  return (
    <div
      className="absolute z-50 bg-gray-900 border border-gray-700 rounded-xl shadow-xl
                 p-3 text-xs space-y-1.5 pointer-events-none min-w-[180px]"
      style={{ left: x, top: y, transform: 'translate(-50%, -110%)' }}
      role="tooltip"
    >
      <p className="font-semibold text-white truncate">{milestone.title}</p>
      <p style={{ color: colors.text }}>● {milestone.status}</p>
      <p className="text-gray-400">Amount: <span className="text-white">{formatAmount(milestone.amount)}</span></p>
      {milestone.submittedAt && (
        <p className="text-gray-400">Submitted: {formatDate(new Date(milestone.submittedAt))}</p>
      )}
      {milestone.resolvedAt && (
        <p className="text-gray-400">Resolved: {formatDate(new Date(milestone.resolvedAt))}</p>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function MilestoneGantt({ milestones = [], startDate, endDate, className = '' }) {
  const [tooltip, setTooltip] = useState({ visible: false, milestone: null, x: 0, y: 0 });
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(600);

  // Responsive width
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const chartWidth = containerWidth - LABEL_WIDTH;

  // ── Compute timeline bounds ───────────────────────────────────────────────
  const { timeStart, timeEnd, totalDays, ticks } = useMemo(() => {
    const dates = milestones.flatMap(m => [
      parseDate(m.submittedAt),
      parseDate(m.resolvedAt),
    ]).filter(Boolean);

    const now = new Date();
    const ts = parseDate(startDate) ?? (dates.length ? new Date(Math.min(...dates)) : addDays(now, -7));
    const te = parseDate(endDate) ?? (dates.length ? new Date(Math.max(...dates)) : addDays(now, 30));

    // Pad by 2 days each side
    const start = addDays(ts, -2);
    const end = addDays(te, 2);
    const total = Math.max(daysBetween(start, end), 7);

    // Generate tick marks (weekly or daily depending on range)
    const tickInterval = total > 60 ? 14 : total > 21 ? 7 : 3;
    const ticks = [];
    for (let i = 0; i <= total; i += tickInterval) {
      ticks.push({ day: i, label: formatDate(addDays(start, i)) });
    }

    return { timeStart: start, timeEnd: end, totalDays: total, ticks };
  }, [milestones, startDate, endDate]);

  // ── Position helpers ──────────────────────────────────────────────────────
  const dayToX = (date) => {
    const d = daysBetween(timeStart, date);
    return Math.max(0, (d / totalDays) * chartWidth);
  };

  const getMilestoneBar = (m, index) => {
    const now = new Date();
    const barStart = parseDate(m.submittedAt) ?? addDays(now, index * 3);
    const barEnd = parseDate(m.resolvedAt) ?? addDays(barStart, Math.max(3, Math.ceil(Number(m.amount) / 10_000_000 / 100)));

    const x = dayToX(barStart);
    const width = Math.max(MIN_BAR_WIDTH, dayToX(barEnd) - x);
    const y = HEADER_HEIGHT + index * (ROW_HEIGHT + ROW_GAP) + ROW_GAP / 2;
    const completion = COMPLETION[m.status] ?? 0;
    const colors = STATUS_COLORS[m.status] ?? STATUS_COLORS.Pending;

    return { x, width, y, completion, colors };
  };

  const svgHeight = HEADER_HEIGHT + milestones.length * (ROW_HEIGHT + ROW_GAP) + ROW_GAP;

  if (milestones.length === 0) {
    return (
      <div className={`card text-center py-10 text-gray-500 ${className}`}>
        <p>No milestones to display</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative overflow-x-auto ${className}`}>
      <div className="flex" style={{ minWidth: LABEL_WIDTH + 400 }}>

        {/* Labels column */}
        <div className="flex-shrink-0" style={{ width: LABEL_WIDTH }}>
          <div style={{ height: HEADER_HEIGHT }} className="flex items-end pb-2">
            <span className="text-xs text-gray-500 font-medium px-2">Milestone</span>
          </div>
          {milestones.map((m, i) => {
            const colors = STATUS_COLORS[m.status] ?? STATUS_COLORS.Pending;
            return (
              <div key={m.id ?? i}
                style={{ height: ROW_HEIGHT + ROW_GAP }}
                className="flex items-center px-2 gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: colors.fill }} />
                <span className="text-xs text-gray-300 truncate" title={m.title}>
                  {m.title}
                </span>
              </div>
            );
          })}
        </div>

        {/* Chart area */}
        <div className="flex-1 relative">
          <svg
            width={chartWidth}
            height={svgHeight}
            aria-label="Milestone Gantt chart"
            role="img"
          >
            {/* Grid lines + tick labels */}
            {ticks.map(({ day, label }) => {
              const x = (day / totalDays) * chartWidth;
              return (
                <g key={day}>
                  <line x1={x} y1={HEADER_HEIGHT} x2={x} y2={svgHeight}
                    stroke="#374151" strokeWidth="1" strokeDasharray="3,3" />
                  <text x={x} y={HEADER_HEIGHT - 6} textAnchor="middle"
                    fontSize="10" fill="#6b7280">{label}</text>
                </g>
              );
            })}

            {/* Today line */}
            {(() => {
              const todayX = dayToX(new Date());
              if (todayX < 0 || todayX > chartWidth) return null;
              return (
                <g>
                  <line x1={todayX} y1={HEADER_HEIGHT} x2={todayX} y2={svgHeight}
                    stroke="#6366f1" strokeWidth="1.5" />
                  <text x={todayX + 3} y={HEADER_HEIGHT - 6} fontSize="9" fill="#818cf8">Today</text>
                </g>
              );
            })()}

            {/* Milestone bars */}
            {milestones.map((m, i) => {
              const { x, width, y, completion, colors } = getMilestoneBar(m, i);
              const barH = ROW_HEIGHT - 8;
              const fillW = (completion / 100) * width;

              return (
                <g key={m.id ?? i}
                  tabIndex={0}
                  role="button"
                  aria-label={`${m.title}: ${m.status}, ${formatAmount(m.amount)}`}
                  onMouseEnter={(e) => {
                    const rect = containerRef.current?.getBoundingClientRect();
                    const svgRect = e.currentTarget.closest('svg').getBoundingClientRect();
                    setTooltip({
                      visible: true, milestone: m,
                      x: x + width / 2 + LABEL_WIDTH,
                      y: y - (rect?.top ?? 0) + (svgRect?.top ?? 0) - (rect?.top ?? 0),
                    });
                  }}
                  onMouseLeave={() => setTooltip(t => ({ ...t, visible: false }))}
                  onFocus={(e) => {
                    const rect = containerRef.current?.getBoundingClientRect();
                    setTooltip({
                      visible: true, milestone: m,
                      x: x + width / 2 + LABEL_WIDTH,
                      y: y,
                    });
                  }}
                  onBlur={() => setTooltip(t => ({ ...t, visible: false }))}
                  style={{ cursor: 'pointer', outline: 'none' }}
                >
                  {/* Background bar */}
                  <rect x={x} y={y + 4} width={width} height={barH}
                    rx="4" fill={colors.bar} />
                  {/* Completion fill */}
                  {fillW > 0 && (
                    <rect x={x} y={y + 4} width={fillW} height={barH}
                      rx="4" fill={colors.fill} opacity="0.85" />
                  )}
                  {/* Label inside bar */}
                  {width > 40 && (
                    <text x={x + 6} y={y + 4 + barH / 2 + 4}
                      fontSize="10" fill="white" opacity="0.9"
                      style={{ pointerEvents: 'none' }}>
                      {completion}%
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Tooltip */}
          <Tooltip {...tooltip} />
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-3 px-2">
        {Object.entries(STATUS_COLORS).map(([status, colors]) => (
          <span key={status} className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: colors.fill }} />
            {status}
          </span>
        ))}
      </div>
    </div>
  );
}
