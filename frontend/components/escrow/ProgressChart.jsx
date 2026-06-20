'use client';

/**
 * ProgressChart — Interactive multi-milestone horizontal timeline
 *
 * Features:
 * - Horizontal timeline with glowing status nodes
 * - Clicking a node opens a sliding details panel
 * - Status-based glow colors: locked, active, disputed, completed
 * - Glassmorphic dark-mode styling
 * - Keyboard navigation + ARIA tags
 * - Micro-animations for transitions and panel slides
 *
 * @param {object}   props
 * @param {Array}    props.milestones  — Milestone objects from the API
 * @param {string}   [props.className]
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { X, Lock, Zap, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  Pending: {
    label: 'Locked',
    color: '#6b7280',
    glow: 'rgba(107,114,128,0.5)',
    ring: '#6b7280',
    bg: 'rgba(107,114,128,0.12)',
    text: '#9ca3af',
    Icon: Lock,
    connectorColor: '#374151',
  },
  Submitted: {
    label: 'Active',
    color: '#6366f1',
    glow: 'rgba(99,102,241,0.6)',
    ring: '#6366f1',
    bg: 'rgba(99,102,241,0.15)',
    text: '#a5b4fc',
    Icon: Zap,
    connectorColor: '#6366f1',
  },
  Approved: {
    label: 'Approved',
    color: '#10b981',
    glow: 'rgba(16,185,129,0.55)',
    ring: '#10b981',
    bg: 'rgba(16,185,129,0.12)',
    text: '#6ee7b7',
    Icon: CheckCircle,
    connectorColor: '#10b981',
  },
  Released: {
    label: 'Completed',
    color: '#34d399',
    glow: 'rgba(52,211,153,0.55)',
    ring: '#34d399',
    bg: 'rgba(52,211,153,0.12)',
    text: '#a7f3d0',
    Icon: CheckCircle,
    connectorColor: '#34d399',
  },
  Rejected: {
    label: 'Rejected',
    color: '#ef4444',
    glow: 'rgba(239,68,68,0.5)',
    ring: '#ef4444',
    bg: 'rgba(239,68,68,0.12)',
    text: '#fca5a5',
    Icon: X,
    connectorColor: '#ef4444',
  },
  Disputed: {
    label: 'Disputed',
    color: '#f59e0b',
    glow: 'rgba(245,158,11,0.55)',
    ring: '#f59e0b',
    bg: 'rgba(245,158,11,0.12)',
    text: '#fde68a',
    Icon: AlertTriangle,
    connectorColor: '#f59e0b',
  },
};

const DEFAULT_STATUS = STATUS_CONFIG.Pending;

function getConfig(status) {
  return STATUS_CONFIG[status] ?? DEFAULT_STATUS;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatAmount(amount) {
  const n = Number(amount) / 10_000_000;
  return (
    n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' USDC'
  );
}

function formatDate(val) {
  if (!val) return '—';
  return new Date(val).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ── Details Panel ─────────────────────────────────────────────────────────────

function DetailsPanel({ milestone, onClose, isOpen }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  // Focus trap: focus close button when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => closeRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!milestone) return null;

  const cfg = getConfig(milestone.status);
  const { Icon } = cfg;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sliding panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Milestone details: ${milestone.title}`}
        className={`
          fixed right-0 top-0 h-full z-50 w-full max-w-md
          flex flex-col
          transition-transform duration-300 ease-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
        style={{
          background: 'rgba(10, 10, 20, 0.92)',
          backdropFilter: 'blur(24px)',
          borderLeft: `1px solid rgba(255,255,255,0.08)`,
          boxShadow: `-8px 0 40px rgba(0,0,0,0.6), inset 1px 0 0 rgba(255,255,255,0.04)`,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-5 border-b"
          style={{ borderColor: 'rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: cfg.bg, boxShadow: `0 0 12px ${cfg.glow}` }}
            >
              <Icon size={16} style={{ color: cfg.color }} aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-sm leading-tight truncate max-w-[220px]">
                {milestone.title}
              </h2>
              <span className="text-xs font-medium mt-0.5 inline-block" style={{ color: cfg.text }}>
                {cfg.label}
              </span>
            </div>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            className="text-gray-500 hover:text-white p-2 rounded-xl hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label="Close details panel"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Status badge */}
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
            style={{
              background: cfg.bg,
              color: cfg.text,
              border: `1px solid ${cfg.ring}40`,
              boxShadow: `0 0 10px ${cfg.glow}`,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: cfg.color }}
              aria-hidden="true"
            />
            {cfg.label}
          </div>

          {/* Payment details */}
          <section aria-labelledby="payment-heading">
            <h3
              id="payment-heading"
              className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3"
            >
              Payment Details
            </h3>
            <div
              className="rounded-2xl p-4 space-y-3"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <Row label="Amount" value={formatAmount(milestone.amount)} highlight />
              <Row label="Milestone #" value={`#${milestone.milestoneIndex + 1}`} />
              <Row label="Escrow ID" value={`#${milestone.escrowId}`} />
            </div>
          </section>

          {/* Deliverables / timeline */}
          <section aria-labelledby="timeline-heading">
            <h3
              id="timeline-heading"
              className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3"
            >
              Timeline
            </h3>
            <div
              className="rounded-2xl p-4 space-y-3"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <Row
                label="Submitted"
                value={formatDate(milestone.submittedAt)}
                icon={<Clock size={12} className="text-gray-500" />}
              />
              <Row
                label="Resolved"
                value={formatDate(milestone.resolvedAt)}
                icon={<CheckCircle size={12} className="text-gray-500" />}
              />
            </div>
          </section>

          {/* Description hash */}
          {milestone.descriptionHash && (
            <section aria-labelledby="hash-heading">
              <h3
                id="hash-heading"
                className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3"
              >
                Content Hash
              </h3>
              <div
                className="rounded-2xl p-4"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <p className="text-xs font-mono text-gray-400 break-all leading-relaxed">
                  {milestone.descriptionHash}
                </p>
              </div>
            </section>
          )}
        </div>

        {/* Footer glow accent */}
        <div
          className="h-px w-full"
          style={{ background: `linear-gradient(90deg, transparent, ${cfg.color}60, transparent)` }}
          aria-hidden="true"
        />
      </div>
    </>
  );
}

function Row({ label, value, highlight, icon }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-xs text-gray-500">
        {icon}
        {label}
      </span>
      <span className={`text-xs font-medium ${highlight ? 'text-white' : 'text-gray-300'}`}>
        {value}
      </span>
    </div>
  );
}

// ── Timeline Node ─────────────────────────────────────────────────────────────

function MilestoneNode({ milestone, index, isSelected, onClick, isLast }) {
  const cfg = getConfig(milestone.status);
  const { Icon } = cfg;
  const nodeRef = useRef(null);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div className="flex flex-col items-center relative" style={{ flex: 1, minWidth: 80 }}>
      {/* Connector line (before node, skip first) */}
      {index > 0 && (
        <div
          className="absolute top-5 right-1/2 h-0.5 transition-all duration-500"
          style={{
            width: '100%',
            background: `linear-gradient(90deg, ${getConfig(milestone.status).connectorColor}80, ${cfg.connectorColor})`,
            left: '-50%',
          }}
          aria-hidden="true"
        />
      )}

      {/* Node button */}
      <button
        ref={nodeRef}
        onClick={onClick}
        onKeyDown={handleKeyDown}
        aria-label={`Milestone ${index + 1}: ${milestone.title}, status: ${cfg.label}. Click to view details.`}
        aria-pressed={isSelected}
        aria-current={isSelected ? 'true' : undefined}
        className="relative z-10 w-10 h-10 rounded-full flex items-center justify-center
                   transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-950"
        style={{
          background: isSelected ? `radial-gradient(circle, ${cfg.color}30, ${cfg.bg})` : cfg.bg,
          border: `2px solid ${cfg.ring}`,
          boxShadow: isSelected
            ? `0 0 0 4px ${cfg.glow}, 0 0 20px ${cfg.glow}, 0 0 40px ${cfg.glow}40`
            : `0 0 8px ${cfg.glow}`,
          transform: isSelected ? 'scale(1.15)' : 'scale(1)',
          '--tw-ring-color': cfg.ring,
        }}
      >
        <Icon
          size={16}
          style={{ color: cfg.color }}
          aria-hidden="true"
          className="transition-transform duration-300"
        />

        {/* Pulse ring for active/disputed */}
        {(milestone.status === 'Submitted' || milestone.status === 'Disputed') && (
          <span
            className="absolute inset-0 rounded-full animate-ping opacity-30"
            style={{ background: cfg.color }}
            aria-hidden="true"
          />
        )}
      </button>

      {/* Index badge */}
      <span
        className="mt-2 text-xs font-bold tabular-nums"
        style={{ color: cfg.text }}
        aria-hidden="true"
      >
        {index + 1}
      </span>

      {/* Title */}
      <span
        className="mt-1 text-xs text-center text-gray-400 leading-tight max-w-[80px] truncate"
        title={milestone.title}
      >
        {milestone.title}
      </span>

      {/* Status label */}
      <span
        className="mt-0.5 text-[10px] font-medium"
        style={{ color: cfg.text }}
        aria-hidden="true"
      >
        {cfg.label}
      </span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ProgressChart({ milestones = [], className = '' }) {
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const containerRef = useRef(null);

  const selectedMilestone = selectedIndex !== null ? milestones[selectedIndex] : null;

  const openPanel = useCallback((index) => {
    setSelectedIndex(index);
    setIsPanelOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setIsPanelOpen(false);
    // Delay clearing selection until animation completes
    setTimeout(() => setSelectedIndex(null), 300);
  }, []);

  // Keyboard: arrow keys to navigate nodes
  const handleContainerKeyDown = useCallback(
    (e) => {
      if (milestones.length === 0) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setSelectedIndex((i) => {
          const next = i === null ? 0 : Math.min(i + 1, milestones.length - 1);
          setIsPanelOpen(true);
          return next;
        });
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setSelectedIndex((i) => {
          const prev = i === null ? milestones.length - 1 : Math.max(i - 1, 0);
          setIsPanelOpen(true);
          return prev;
        });
      }
    },
    [milestones.length],
  );

  // Progress summary
  const completed = milestones.filter(
    (m) => m.status === 'Released' || m.status === 'Approved',
  ).length;
  const progressPct = milestones.length > 0 ? Math.round((completed / milestones.length) * 100) : 0;

  if (milestones.length === 0) {
    return (
      <div
        className={`rounded-2xl p-8 text-center text-gray-500 ${className}`}
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <p className="text-sm">No milestones to display</p>
      </div>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        className={`rounded-2xl p-6 ${className}`}
        style={{
          background: 'rgba(10,10,20,0.7)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
        onKeyDown={handleContainerKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-sm font-semibold text-white">Milestone Progress</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {completed} of {milestones.length} completed
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="text-xs font-bold tabular-nums px-2.5 py-1 rounded-full"
              style={{
                background: 'rgba(99,102,241,0.15)',
                color: '#a5b4fc',
                border: '1px solid rgba(99,102,241,0.3)',
              }}
              aria-label={`${progressPct}% complete`}
            >
              {progressPct}%
            </div>
          </div>
        </div>

        {/* Overall progress bar */}
        <div
          className="w-full h-1.5 rounded-full mb-8 overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.06)' }}
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Overall escrow progress: ${progressPct}%`}
        >
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${progressPct}%`,
              background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #34d399)',
              boxShadow: '0 0 8px rgba(99,102,241,0.6)',
            }}
          />
        </div>

        {/* Timeline */}
        <div
          className="relative flex items-start overflow-x-auto pb-2"
          role="list"
          aria-label="Milestone timeline"
        >
          {milestones.map((milestone, index) => (
            <div key={milestone.id ?? index} role="listitem" style={{ flex: 1, minWidth: 80 }}>
              <MilestoneNode
                milestone={milestone}
                index={index}
                isSelected={selectedIndex === index}
                onClick={() => openPanel(index)}
                isLast={index === milestones.length - 1}
              />
            </div>
          ))}
        </div>

        {/* Legend */}
        <div
          className="flex flex-wrap gap-x-4 gap-y-2 mt-6 pt-4"
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
          aria-label="Status legend"
        >
          {Object.entries(STATUS_CONFIG).map(([status, cfg]) => (
            <span key={status} className="flex items-center gap-1.5 text-[10px] text-gray-500">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: cfg.color, boxShadow: `0 0 4px ${cfg.glow}` }}
                aria-hidden="true"
              />
              {cfg.label}
            </span>
          ))}
        </div>

        {/* Keyboard hint */}
        <p className="text-[10px] text-gray-600 mt-3" aria-live="polite">
          Use ← → arrow keys to navigate milestones, Enter or Space to open details
        </p>
      </div>

      {/* Details panel */}
      <DetailsPanel milestone={selectedMilestone} isOpen={isPanelOpen} onClose={closePanel} />
    </>
  );
}
