'use client';

/**
 * DisputeTermsDiff
 *
 * Renders a word-level diff between original escrow terms and the disputing
 * party's description. Deletions are highlighted red, additions green.
 *
 * Desktop: side-by-side columns.
 * Mobile:  unified single-column view (toggled via CSS breakpoint).
 */

import { useMemo, useState } from 'react';

// ── Diff engine ────────────────────────────────────────────────────────────────

function tokenize(text) {
  return (text || '').split(/(\s+)/);
}

/**
 * Myers diff on token arrays.
 * Returns an array of { type: 'equal'|'delete'|'insert', value: string }.
 */
function computeDiff(oldTokens, newTokens) {
  const m = oldTokens.length;
  const n = newTokens.length;
  const max = m + n;
  const v = new Array(2 * max + 1).fill(0);
  const trace = [];

  for (let d = 0; d <= max; d++) {
    trace.push([...v]);
    for (let k = -d; k <= d; k += 2) {
      let x;
      if (k === -d || (k !== d && v[k - 1 + max] < v[k + 1 + max])) {
        x = v[k + 1 + max];
      } else {
        x = v[k - 1 + max] + 1;
      }
      let y = x - k;
      while (x < m && y < n && oldTokens[x] === newTokens[y]) {
        x++;
        y++;
      }
      v[k + max] = x;
      if (x >= m && y >= n) {
        return backtrack(trace, oldTokens, newTokens, max);
      }
    }
  }
  return backtrack(trace, oldTokens, newTokens, max);
}

function backtrack(trace, oldTokens, newTokens, max) {
  const ops = [];
  let x = oldTokens.length;
  let y = newTokens.length;

  for (let d = trace.length - 1; d >= 0; d--) {
    const v = trace[d];
    const k = x - y;
    let prevK;
    if (k === -d || (k !== d && v[k - 1 + max] < v[k + 1 + max])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = v[prevK + max];
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      ops.push({ type: 'equal', value: oldTokens[x - 1] });
      x--;
      y--;
    }
    if (d > 0) {
      if (x > prevX) {
        ops.push({ type: 'delete', value: oldTokens[x - 1] });
        x--;
      } else if (y > prevY) {
        ops.push({ type: 'insert', value: newTokens[y - 1] });
        y--;
      }
    }
  }
  return ops.reverse();
}

function diffWords(original, updated) {
  const oldTokens = tokenize(original);
  const newTokens = tokenize(updated);
  return computeDiff(oldTokens, newTokens);
}

// ── Token renderers ────────────────────────────────────────────────────────────

function DiffToken({ type, value }) {
  if (type === 'delete') {
    return (
      <mark className="bg-red-500/20 text-red-300 rounded px-0.5 line-through decoration-red-500/60">
        {value}
      </mark>
    );
  }
  if (type === 'insert') {
    return (
      <mark className="bg-green-500/20 text-green-300 rounded px-0.5">
        {value}
      </mark>
    );
  }
  return <span>{value}</span>;
}

// ── Side panels ────────────────────────────────────────────────────────────────

function OriginalPanel({ tokens, timestamp }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Original agreed terms
        </span>
        {timestamp && (
          <time
            dateTime={timestamp}
            className="text-xs text-slate-500"
            title={new Date(timestamp).toLocaleString()}
          >
            {new Date(timestamp).toLocaleDateString()}
          </time>
        )}
      </div>
      <div
        className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm leading-7 text-slate-300 min-h-[120px]"
        aria-label="Original agreed terms"
      >
        {tokens
          .filter((t) => t.type !== 'insert')
          .map((t, i) => (
            <DiffToken key={i} type={t.type} value={t.value} />
          ))}
      </div>
    </div>
  );
}

function DisputePanel({ tokens, timestamp }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Dispute description
        </span>
        {timestamp && (
          <time
            dateTime={timestamp}
            className="text-xs text-slate-500"
            title={new Date(timestamp).toLocaleString()}
          >
            {new Date(timestamp).toLocaleDateString()}
          </time>
        )}
      </div>
      <div
        className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm leading-7 text-slate-300 min-h-[120px]"
        aria-label="Dispute description"
      >
        {tokens
          .filter((t) => t.type !== 'delete')
          .map((t, i) => (
            <DiffToken key={i} type={t.type} value={t.value} />
          ))}
      </div>
    </div>
  );
}

function UnifiedPanel({ tokens, originalTimestamp, disputeTimestamp }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Unified diff
        </span>
        <div className="flex gap-3 text-xs text-slate-500">
          {originalTimestamp && (
            <span>
              Terms:{' '}
              <time dateTime={originalTimestamp}>
                {new Date(originalTimestamp).toLocaleDateString()}
              </time>
            </span>
          )}
          {disputeTimestamp && (
            <span>
              Dispute:{' '}
              <time dateTime={disputeTimestamp}>
                {new Date(disputeTimestamp).toLocaleDateString()}
              </time>
            </span>
          )}
        </div>
      </div>
      <div
        className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm leading-7 text-slate-300 min-h-[120px]"
        aria-label="Unified diff of original terms and dispute description"
      >
        {tokens.map((t, i) => (
          <DiffToken key={i} type={t.type} value={t.value} />
        ))}
      </div>
    </div>
  );
}

// ── Legend ─────────────────────────────────────────────────────────────────────

function DiffLegend() {
  return (
    <div className="flex items-center gap-4 text-xs text-slate-400" aria-label="Diff legend">
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded bg-red-500/30 border border-red-500/40" aria-hidden="true" />
        Removed / changed
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded bg-green-500/30 border border-green-500/40" aria-hidden="true" />
        Added / new
      </span>
    </div>
  );
}

// ── Public component ───────────────────────────────────────────────────────────

/**
 * @param {object} props
 * @param {string} props.originalTerms        — text captured at escrow creation
 * @param {string} props.disputeDescription   — text submitted by the disputing party
 * @param {string} [props.originalTimestamp]  — ISO timestamp of escrow creation
 * @param {string} [props.disputeTimestamp]   — ISO timestamp of dispute submission
 */
export default function DisputeTermsDiff({
  originalTerms = '',
  disputeDescription = '',
  originalTimestamp,
  disputeTimestamp,
}) {
  const [view, setView] = useState('side-by-side');
  const tokens = useMemo(
    () => diffWords(originalTerms, disputeDescription),
    [originalTerms, disputeDescription],
  );

  return (
    <section
      aria-labelledby="dispute-diff-heading"
      className="rounded-[28px] border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20 space-y-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Contract analysis</p>
          <h2 id="dispute-diff-heading" className="mt-2 text-xl font-semibold text-white">
            Terms vs. dispute claim
          </h2>
        </div>

        <div className="flex items-center gap-2" role="group" aria-label="Diff view selector">
          <button
            type="button"
            onClick={() => setView('side-by-side')}
            aria-pressed={view === 'side-by-side'}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              view === 'side-by-side'
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'border-white/10 text-slate-400 hover:text-white'
            }`}
          >
            Side by side
          </button>
          <button
            type="button"
            onClick={() => setView('unified')}
            aria-pressed={view === 'unified'}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              view === 'unified'
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'border-white/10 text-slate-400 hover:text-white'
            }`}
          >
            Unified
          </button>
        </div>
      </div>

      <DiffLegend />

      {/* Side-by-side: shown on md+ by default, hidden on mobile unless selected */}
      <div
        className={`grid gap-4 md:grid-cols-2 ${view === 'unified' ? 'hidden' : 'hidden md:grid'}`}
        aria-hidden={view === 'unified'}
      >
        <OriginalPanel tokens={tokens} timestamp={originalTimestamp} />
        <DisputePanel tokens={tokens} timestamp={disputeTimestamp} />
      </div>

      {/* Unified: shown on mobile always, or when explicitly selected */}
      <div
        className={`${view === 'side-by-side' ? 'md:hidden' : ''}`}
        aria-hidden={view === 'side-by-side' ? undefined : undefined}
      >
        <UnifiedPanel
          tokens={tokens}
          originalTimestamp={originalTimestamp}
          disputeTimestamp={disputeTimestamp}
        />
      </div>
    </section>
  );
}
