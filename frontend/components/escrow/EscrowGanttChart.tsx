'use client';

/**
 * EscrowGanttChart — Full-featured Gantt chart for escrow milestones
 *
 * Features:
 * - Horizontal bar chart per milestone on a shared time axis
 * - Dependency arrows drawn between dependent milestones (SVG connectors)
 * - Critical path highlighting (longest dependency chain)
 * - Status colours: pending (grey), in_progress (blue), completed (green), overdue (red)
 * - Progress fill on each bar
 * - Zoom controls: Day / Week / Month / Quarter
 * - Pan: horizontal drag + keyboard arrow navigation
 * - Tooltip on hover with milestone details
 * - Export PNG button (2× retina)
 * - Keyboard: Tab between bars, Enter opens detail
 * - Cycle detection with CyclicDependencyError
 * - Empty state for 0 milestones
 *
 * Uses pure SVG (no Canvas) for accessibility. Canvas only for PNG export.
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { cn } from '../../lib/utils';
import {
  computeCriticalPath,
  topologicalSort,
  CyclicDependencyError,
  createScale,
  createInverseScale,
  ZOOM_LEVELS,
  generateTicks,
} from '../../lib/gantt-utils';

// ── Types ──────────────────────────────────────────────────────────────────────

export type GanttMilestoneStatus = 'pending' | 'in_progress' | 'completed' | 'overdue';

export interface GanttMilestone {
  milestone_id: string;
  title: string;
  start_date: string;
  end_date: string;
  status: GanttMilestoneStatus;
  depends_on?: string[];
  progress_pct: number;
  assignee?: string;
}

export interface EscrowGanttChartProps {
  milestones: GanttMilestone[];
  className?: string;
  onMilestoneClick?: (milestone: GanttMilestone) => void;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const ROW_HEIGHT = 48;
const ROW_GAP = 6;
const LABEL_WIDTH = 160;
const HEADER_HEIGHT = 44;
const BAR_HEIGHT = 28;
const MIN_BAR_PX = 6;
const ARROW_HEAD_SIZE = 6;

const STATUS_COLOURS: Record<GanttMilestoneStatus, { bar: string; fill: string; text: string; label: string }> = {
  pending: { bar: '#4b5563', fill: '#6b7280', text: '#d1d5db', label: 'Pending' },
  in_progress: { bar: '#1e40af', fill: '#3b82f6', text: '#93c5fd', label: 'In Progress' },
  completed: { bar: '#065f46', fill: '#10b981', text: '#6ee7b7', label: 'Completed' },
  overdue: { bar: '#7f1d1d', fill: '#ef4444', text: '#fca5a5', label: 'Overdue' },
};

const CRITICAL_PATH_COLOUR = '#f59e0b';

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseDate(val: string): Date | null {
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateAxis(d: Date, zoom: string): string {
  switch (zoom) {
    case 'Day':
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    case 'Week':
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    case 'Month':
      return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
    case 'Quarter':
      return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
    default:
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
}

// ── Tooltip ────────────────────────────────────────────────────────────────────

function GanttTooltip({
  milestone,
  x,
  y,
  visible,
}: {
  milestone: GanttMilestone | null;
  x: number;
  y: number;
  visible: boolean;
}) {
  if (!visible || !milestone) return null;
  const colours = STATUS_COLOURS[milestone.status] ?? STATUS_COLOURS.pending;
  return (
    <div
      className="absolute z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-3 text-xs space-y-1.5 pointer-events-none min-w-[200px]"
      style={{ left: x, top: y, transform: 'translate(-50%, -110%)' }}
      role="tooltip"
      data-testid="gantt-tooltip"
    >
      <p className="font-semibold text-white truncate">{milestone.title}</p>
      <p style={{ color: colours.text }}>● {colours.label}</p>
      <p className="text-gray-400">
        Start: <span className="text-white">{formatDateShort(new Date(milestone.start_date))}</span>
      </p>
      <p className="text-gray-400">
        End: <span className="text-white">{formatDateShort(new Date(milestone.end_date))}</span>
      </p>
      <p className="text-gray-400">
        Progress: <span className="text-white">{milestone.progress_pct}%</span>
      </p>
      {milestone.assignee && (
        <p className="text-gray-400">
          Assignee: <span className="text-white">{milestone.assignee}</span>
        </p>
      )}
    </div>
  );
}

// ── Zoom Controls ──────────────────────────────────────────────────────────────

function ZoomControls({
  zoom,
  onZoomChange,
}: {
  zoom: string;
  onZoomChange: (z: string) => void;
}) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Zoom level">
      {ZOOM_LEVELS.map((level) => (
        <button
          key={level}
          role="radio"
          aria-checked={zoom === level}
          onClick={() => onZoomChange(level)}
          className={cn(
            'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
            zoom === level
              ? 'bg-brand-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300',
          )}
          data-testid={`zoom-${level.toLowerCase()}`}
        >
          {level}
        </button>
      ))}
    </div>
  );
}

// ── Export PNG ─────────────────────────────────────────────────────────────────

function exportToPng(svgEl: SVGSVGElement, filename: string) {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(clone);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 2;
    canvas.width = img.width * dpr;
    canvas.height = img.height * dpr;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#111827';
      ctx.fillRect(0, 0, img.width, img.height);
      ctx.drawImage(img, 0, 0);
    }
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    }, 'image/png');
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

// ── Dependency Arrow ───────────────────────────────────────────────────────────

function DependencyArrow({
  x1,
  y1,
  x2,
  y2,
  isCritical,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isCritical: boolean;
}) {
  const midX = (x1 + x2) / 2;
  const colour = isCritical ? CRITICAL_PATH_COLOUR : '#4b5563';
  const strokeWidth = isCritical ? 2 : 1.5;

  // Route around overlapping bars: go right, then down/up, then right
  const path =
    x2 > x1 + 20
      ? `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
      : `M ${x1} ${y1} C ${x1 + 30} ${y1}, ${x2 - 30} ${y2}, ${x2} ${y2}`;

  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke={colour}
        strokeWidth={strokeWidth}
        strokeDasharray={isCritical ? 'none' : '4,3'}
        markerEnd={`url(#arrowhead-${isCritical ? 'critical' : 'default'})`}
      />
    </g>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function EscrowGanttChart({
  milestones = [],
  className = '',
  onMilestoneClick,
}: EscrowGanttChartProps) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [zoom, setZoom] = useState('Week');
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    milestone: GanttMilestone | null;
    x: number;
    y: number;
  }>({ visible: false, milestone: null, x: 0, y: 0 });
  const [panOffset, setPanOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartPan, setDragStartPan] = useState(0);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [cycleError, setCycleError] = useState<CyclicDependencyError | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  // ── Responsive width ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const chartWidth = containerWidth - LABEL_WIDTH;

  // ── Cycle detection ────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      if (milestones.length > 0) topologicalSort(milestones);
      setCycleError(null);
    } catch (e) {
      if (e instanceof CyclicDependencyError) setCycleError(e);
    }
  }, [milestones]);

  // ── Critical path ──────────────────────────────────────────────────────────
  const criticalPath = useMemo(() => {
    if (milestones.length === 0 || cycleError) return new Set<string>();
    return computeCriticalPath(milestones);
  }, [milestones, cycleError]);

  // ── Timeline bounds ────────────────────────────────────────────────────────
  const { timeStart, timeEnd, totalDays, scale } = useMemo(() => {
    const now = new Date();
    const dates = milestones
      .flatMap((m) => [parseDate(m.start_date), parseDate(m.end_date)])
      .filter(Boolean) as Date[];

    const minDate = dates.length > 0 ? new Date(Math.min(...dates.map((d) => d.getTime()))) : addDays(now, -7);
    const maxDate = dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : addDays(now, 30);

    const start = addDays(minDate, -3);
    const end = addDays(maxDate, 3);
    const total = Math.max(daysBetween(start, end), 7);
    const s = createScale(start, end, 0, chartWidth);

    return { timeStart: start, timeEnd: end, totalDays: total, scale: s };
  }, [milestones, chartWidth]);

  // ── Zoomed time range ──────────────────────────────────────────────────────
  const { visibleStart, visibleEnd, visibleScale } = useMemo(() => {
    const zoomDays = { Day: 14, Week: 60, Month: 180, Quarter: 365 }[zoom] ?? 60;
    const center = new Date((timeStart.getTime() + timeEnd.getTime()) / 2);
    const halfRange = (zoomDays / 2) * 86400000;
    const vs = new Date(center.getTime() - halfRange + panOffset * 86400000);
    const ve = new Date(center.getTime() + halfRange + panOffset * 86400000);
    const s = createScale(vs, ve, 0, chartWidth);
    return { visibleStart: vs, visibleEnd: ve, visibleScale: s };
  }, [timeStart, timeEnd, zoom, panOffset, chartWidth]);

  // ── Ticks ──────────────────────────────────────────────────────────────────
  const ticks = useMemo(() => {
    const tickInterval = { Day: 1, Week: 7, Month: 1, Quarter: 1 }[zoom] ?? 7;
    const result: { date: Date; label: string; x: number }[] = [];
    const current = new Date(visibleStart);

    if (zoom === 'Month') {
      current.setDate(1);
      while (current <= visibleEnd) {
        result.push({
          date: new Date(current),
          label: formatDateAxis(current, zoom),
          x: visibleScale(current),
        });
        current.setMonth(current.getMonth() + 1);
      }
    } else if (zoom === 'Quarter') {
      current.setDate(1);
      current.setMonth(Math.floor(current.getMonth() / 3) * 3);
      while (current <= visibleEnd) {
        result.push({
          date: new Date(current),
          label: formatDateAxis(current, zoom),
          x: visibleScale(current),
        });
        current.setMonth(current.getMonth() + 3);
      }
    } else {
      while (current <= visibleEnd) {
        result.push({
          date: new Date(current),
          label: formatDateAxis(current, zoom),
          x: visibleScale(current),
        });
        current.setDate(current.getDate() + tickInterval);
      }
    }
    return result;
  }, [visibleStart, visibleEnd, zoom, visibleScale]);

  // ── Milestone bar positions ────────────────────────────────────────────────
  const barPositions = useMemo(() => {
    return milestones.map((m, i) => {
      const start = parseDate(m.start_date) ?? addDays(new Date(), i * 7);
      const end = parseDate(m.end_date) ?? addDays(start, 7);
      const x1 = visibleScale(start);
      const x2 = visibleScale(end);
      const x = Math.min(x1, x2);
      const width = Math.max(MIN_BAR_PX, Math.abs(x2 - x1));
      const y = HEADER_HEIGHT + i * (ROW_HEIGHT + ROW_GAP) + (ROW_HEIGHT - BAR_HEIGHT) / 2;
      const colours = STATUS_COLOURS[m.status] ?? STATUS_COLOURS.pending;
      const isCritical = criticalPath.has(m.milestone_id);

      return { x, width, y, colours, isCritical, start, end };
    });
  }, [milestones, visibleScale, criticalPath]);

  const svgHeight = HEADER_HEIGHT + milestones.length * (ROW_HEIGHT + ROW_GAP) + ROW_GAP;

  // ── Pan handlers ───────────────────────────────────────────────────────────
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      setIsDragging(true);
      setDragStartX(e.clientX);
      setDragStartPan(panOffset);
    },
    [panOffset],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartX;
      const daysPerPixel = (visibleEnd.getTime() - visibleStart.getTime()) / chartWidth / 86400000;
      setPanOffset(dragStartPan - dx * daysPerPixel);
    },
    [isDragging, dragStartX, dragStartPan, visibleEnd, visibleStart, chartWidth],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // ── Keyboard navigation ────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setPanOffset((p) => p - ({ Day: 1, Week: 7, Month: 30, Quarter: 90 }[zoom] ?? 7));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setPanOffset((p) => p + ({ Day: 1, Week: 7, Month: 30, Quarter: 90 }[zoom] ?? 7));
      }
    };
    if (focusedIndex >= 0) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [focusedIndex, zoom]);

  // ── Export handler ─────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    if (!svgRef.current) return;
    exportToPng(svgRef.current, 'gantt-chart.png');
  }, []);

  // ── Empty state ────────────────────────────────────────────────────────────
  if (milestones.length === 0) {
    return (
      <div
        className={cn('card text-center py-12 text-gray-500', className)}
        data-testid="gantt-empty"
      >
        <p className="text-lg font-medium">No milestones to display</p>
        <p className="text-sm mt-1">Add milestones to see the Gantt timeline</p>
      </div>
    );
  }

  // ── Cycle error state ──────────────────────────────────────────────────────
  if (cycleError) {
    return (
      <div
        className={cn('card border border-red-800 bg-red-950/50 text-center py-12', className)}
        data-testid="gantt-cycle-error"
      >
        <p className="text-lg font-semibold text-red-400">Cyclic Dependency Detected</p>
        <p className="text-sm mt-1 text-red-300">{cycleError.message}</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)} data-testid="escrow-gantt-chart">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <ZoomControls zoom={zoom} onZoomChange={setZoom} />
        <button
          onClick={handleExport}
          className="px-3 py-1.5 text-xs font-medium bg-gray-800 text-gray-300 rounded-md
                     hover:bg-gray-700 hover:text-white transition-colors"
          data-testid="export-png"
        >
          Export PNG
        </button>
      </div>

      {/* Chart */}
      <div
        ref={containerRef}
        className={cn(
          'relative overflow-hidden rounded-lg border border-gray-800 bg-gray-950',
          isDragging ? 'cursor-grabbing' : 'cursor-grab',
        )}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div className="flex" style={{ minWidth: LABEL_WIDTH + 400 }}>
          {/* Labels column */}
          <div className="flex-shrink-0 border-r border-gray-800" style={{ width: LABEL_WIDTH }}>
            <div
              style={{ height: HEADER_HEIGHT }}
              className="flex items-end pb-2 px-3"
            >
              <span className="text-xs text-gray-500 font-medium">Milestone</span>
            </div>
            {milestones.map((m, i) => {
              const colours = STATUS_COLOURS[m.status] ?? STATUS_COLOURS.pending;
              const isCrit = criticalPath.has(m.milestone_id);
              return (
                <div
                  key={m.milestone_id}
                  style={{ height: ROW_HEIGHT + ROW_GAP }}
                  className="flex items-center px-3 gap-2"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: isCrit ? CRITICAL_PATH_COLOUR : colours.fill }}
                  />
                  <span className="text-xs text-gray-300 truncate" title={m.title}>
                    {m.title}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Chart SVG area */}
          <div className="flex-1 overflow-x-auto">
            <svg
              ref={svgRef}
              width={Math.max(chartWidth, 400)}
              height={svgHeight}
              aria-label="Escrow milestone Gantt chart"
              role="img"
              data-testid="gantt-svg"
            >
              {/* Arrow markers */}
              <defs>
                <marker
                  id="arrowhead-default"
                  markerWidth={ARROW_HEAD_SIZE}
                  markerHeight={ARROW_HEAD_SIZE}
                  refX={ARROW_HEAD_SIZE}
                  refY={ARROW_HEAD_SIZE / 2}
                  orient="auto"
                >
                  <polygon
                    points={`0 0, ${ARROW_HEAD_SIZE} ${ARROW_HEAD_SIZE / 2}, 0 ${ARROW_HEAD_SIZE}`}
                    fill="#4b5563"
                  />
                </marker>
                <marker
                  id="arrowhead-critical"
                  markerWidth={ARROW_HEAD_SIZE}
                  markerHeight={ARROW_HEAD_SIZE}
                  refX={ARROW_HEAD_SIZE}
                  refY={ARROW_HEAD_SIZE / 2}
                  orient="auto"
                >
                  <polygon
                    points={`0 0, ${ARROW_HEAD_SIZE} ${ARROW_HEAD_SIZE / 2}, 0 ${ARROW_HEAD_SIZE}`}
                    fill={CRITICAL_PATH_COLOUR}
                  />
                </marker>
              </defs>

              {/* Grid lines + tick labels */}
              {ticks.map(({ date, label, x }) => (
                <g key={date.getTime()}>
                  <line
                    x1={x}
                    y1={HEADER_HEIGHT}
                    x2={x}
                    y2={svgHeight}
                    stroke="#1f2937"
                    strokeWidth="1"
                  />
                  <text
                    x={x}
                    y={HEADER_HEIGHT - 8}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#6b7280"
                  >
                    {label}
                  </text>
                </g>
              ))}

              {/* Today line */}
              {(() => {
                const todayX = visibleScale(new Date());
                if (todayX < 0 || todayX > chartWidth) return null;
                return (
                  <g>
                    <line
                      x1={todayX}
                      y1={HEADER_HEIGHT}
                      x2={todayX}
                      y2={svgHeight}
                      stroke="#6366f1"
                      strokeWidth="1.5"
                      strokeDasharray="4,4"
                    />
                    <text x={todayX + 4} y={HEADER_HEIGHT - 8} fontSize="9" fill="#818cf8">
                      Today
                    </text>
                  </g>
                );
              })()}

              {/* Dependency arrows (rendered below bars) */}
              {milestones.map((m, i) => {
                if (!m.depends_on?.length) return null;
                const targetPos = barPositions[i];
                return m.depends_on.map((depId) => {
                  const depIndex = milestones.findIndex((dm) => dm.milestone_id === depId);
                  if (depIndex < 0) return null;
                  const sourcePos = barPositions[depIndex];
                  const isCrit =
                    criticalPath.has(m.milestone_id) && criticalPath.has(depId);
                  return (
                    <DependencyArrow
                      key={`${depId}->${m.milestone_id}`}
                      x1={sourcePos.x + sourcePos.width}
                      y1={sourcePos.y + BAR_HEIGHT / 2}
                      x2={targetPos.x}
                      y2={targetPos.y + BAR_HEIGHT / 2}
                      isCritical={isCrit}
                    />
                  );
                });
              })}

              {/* Milestone bars */}
              {milestones.map((m, i) => {
                const pos = barPositions[i];
                const fillW = (m.progress_pct / 100) * pos.width;

                return (
                  <g
                    key={m.milestone_id}
                    tabIndex={0}
                    role="button"
                    aria-label={`${m.title}: ${STATUS_COLOURS[m.status]?.label ?? m.status}, ${m.progress_pct}% complete`}
                    data-testid={`milestone-bar-${m.milestone_id}`}
                    onMouseEnter={(e) => {
                      const rect = containerRef.current?.getBoundingClientRect();
                      const svgRect = e.currentTarget.closest('svg')?.getBoundingClientRect();
                      if (!rect || !svgRect) return;
                      setTooltip({
                        visible: true,
                        milestone: m,
                        x: pos.x + pos.width / 2 + LABEL_WIDTH,
                        y: pos.y - (rect.top - svgRect.top),
                      });
                    }}
                    onMouseLeave={() => setTooltip((t) => ({ ...t, visible: false }))}
                    onFocus={() => {
                      setFocusedIndex(i);
                      setTooltip({
                        visible: true,
                        milestone: m,
                        x: pos.x + pos.width / 2 + LABEL_WIDTH,
                        y: pos.y,
                      });
                    }}
                    onBlur={() => {
                      setFocusedIndex(-1);
                      setTooltip((t) => ({ ...t, visible: false }));
                    }}
                    onClick={() => onMilestoneClick?.(m)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onMilestoneClick?.(m);
                      }
                    }}
                    style={{ cursor: 'pointer', outline: 'none' }}
                  >
                    {/* Critical path highlight ring */}
                    {pos.isCritical && (
                      <rect
                        x={pos.x - 3}
                        y={pos.y + 4 - 3}
                        width={pos.width + 6}
                        height={BAR_HEIGHT + 6}
                        rx="6"
                        fill="none"
                        stroke={CRITICAL_PATH_COLOUR}
                        strokeWidth="1.5"
                        strokeDasharray="4,2"
                        opacity="0.6"
                      />
                    )}

                    {/* Background bar */}
                    <rect
                      x={pos.x}
                      y={pos.y + 4}
                      width={pos.width}
                      height={BAR_HEIGHT}
                      rx="4"
                      fill={pos.colours.bar}
                    />

                    {/* Progress fill */}
                    {fillW > 0 && (
                      <rect
                        x={pos.x}
                        y={pos.y + 4}
                        width={fillW}
                        height={BAR_HEIGHT}
                        rx="4"
                        fill={pos.colours.fill}
                        opacity="0.85"
                      />
                    )}

                    {/* Progress percentage text */}
                    {pos.width > 40 && (
                      <text
                        x={pos.x + 6}
                        y={pos.y + 4 + BAR_HEIGHT / 2 + 4}
                        fontSize="10"
                        fontWeight="500"
                        fill="white"
                        opacity="0.9"
                        style={{ pointerEvents: 'none' }}
                      >
                        {m.progress_pct}%
                      </text>
                    )}

                    {/* Focus ring */}
                    {focusedIndex === i && (
                      <rect
                        x={pos.x - 2}
                        y={pos.y + 4 - 2}
                        width={pos.width + 4}
                        height={BAR_HEIGHT + 4}
                        rx="5"
                        fill="none"
                        stroke="#818cf8"
                        strokeWidth="2"
                      />
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Tooltip */}
            <GanttTooltip {...tooltip} />
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 px-2">
        {Object.entries(STATUS_COLOURS).map(([status, colours]) => (
          <span key={status} className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: colours.fill }} />
            {colours.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-xs text-gray-400">
          <span
            className="w-2.5 h-2.5 rounded-sm border"
            style={{ borderColor: CRITICAL_PATH_COLOUR, borderStyle: 'dashed' }}
          />
          Critical Path
        </span>
      </div>
    </div>
  );
}
