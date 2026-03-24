'use client';

/**
 * ActivityTimeline — Recent Escrow Activity Feed
 *
 * Renders a vertical timeline of the user's 10 most recent escrow events
 * fetched from GET /api/escrows/activity/:address.
 *
 * @param {{ address: string }} props
 */

import { useState, useEffect } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function statusConfig(status) {
  switch (status) {
    case 'Active':     return { icon: '🔒', color: 'text-indigo-400',  dot: 'bg-indigo-500',  label: 'Active' };
    case 'Completed':  return { icon: '✅', color: 'text-emerald-400', dot: 'bg-emerald-500', label: 'Completed' };
    case 'Disputed':   return { icon: '⚠️', color: 'text-amber-400',  dot: 'bg-amber-500',   label: 'Disputed' };
    case 'Cancelled':  return { icon: '❌', color: 'text-red-400',     dot: 'bg-red-500',     label: 'Cancelled' };
    default:           return { icon: '📦', color: 'text-gray-400',    dot: 'bg-gray-500',    label: status };
  }
}

function truncate(str) {
  if (!str) return '—';
  return `${str.slice(0, 6)}…${str.slice(-4)}`;
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1)   return 'just now';
  if (minutes < 60)  return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)    return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function TimelineSkeleton() {
  return (
    <div className="flex flex-col gap-0">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-4 animate-pulse">
          <div className="flex flex-col items-center">
            <div className="w-3 h-3 rounded-full bg-gray-700 mt-1" />
            {i < 3 && <div className="w-0.5 h-12 bg-gray-800 mt-1" />}
          </div>
          <div className="pb-8 flex-1">
            <div className="h-3 w-48 bg-gray-700 rounded mb-2" />
            <div className="h-3 w-32 bg-gray-800 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Timeline Item ─────────────────────────────────────────────────────────────

function TimelineItem({ escrow, address, isLast }) {
  const cfg = statusConfig(escrow.status);
  const role = escrow.clientAddress === address ? 'client' : 'freelancer';
  const counterparty = role === 'client' ? escrow.freelancerAddress : escrow.clientAddress;

  return (
    <div className="flex gap-4 group">
      {/* Dot + line */}
      <div className="flex flex-col items-center shrink-0">
        <div className={`w-3 h-3 rounded-full mt-1 ring-2 ring-gray-950 ${cfg.dot} transition-transform group-hover:scale-125`} />
        {!isLast && <div className="w-0.5 flex-1 bg-gray-800 mt-1 min-h-[2.5rem]" />}
      </div>

      {/* Content */}
      <div className={`pb-6 flex-1 ${isLast ? '' : ''}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-white">
            Escrow #{escrow.id.toString()}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color} bg-gray-800`}>
            {cfg.icon} {cfg.label}
          </span>
          <span className="text-xs text-gray-500 ml-auto">{timeAgo(escrow.updatedAt)}</span>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          As <span className="text-gray-400 capitalize">{role}</span>
          {' · '}
          Counterparty: <span className="font-mono text-gray-400">{truncate(counterparty)}</span>
          {' · '}
          <span className="text-gray-300">{escrow.totalAmount}</span>
        </p>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ActivityTimeline({ address }) {
  const [escrows, setEscrows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!address) { setLoading(false); return; }

    setLoading(true);
    fetch(`${API_BASE}/api/escrows/activity/${address}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setEscrows(data.escrows || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [address]);

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Recent Activity</h2>
        <span className="text-xs text-gray-500">Last 10 events</span>
      </div>

      {loading && <TimelineSkeleton />}

      {!loading && error && (
        <div className="bg-red-900/20 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3">
          ⚠️ Could not load activity: {error}
        </div>
      )}

      {!loading && !error && escrows.length === 0 && (
        <div className="card text-center py-10">
          <p className="text-3xl mb-2">🌑</p>
          <p className="text-gray-400 font-medium">No activity yet</p>
          <p className="text-gray-600 text-sm mt-1">Create your first escrow to see it here.</p>
        </div>
      )}

      {!loading && !error && escrows.length > 0 && (
        <div className="card">
          {escrows.map((escrow, i) => (
            <TimelineItem
              key={escrow.id.toString()}
              escrow={escrow}
              address={address}
              isLast={i === escrows.length - 1}
            />
          ))}
        </div>
      )}
    </section>
  );
}
