'use client';

/**
 * StatWidgets — Dashboard Analytics Stat Cards
 *
 * Renders six animated stat cards for a user's escrow metrics:
 * total, active, completed, success rate, total value locked, and disputed.
 *
 * Fetches data from GET /api/escrows/stats/:address
 *
 * @param {{ address: string }} props
 */

import { useState, useEffect } from 'react';
import {
  RadialBarChart,
  RadialBar,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="card animate-pulse">
      <div className="h-3 w-20 bg-gray-700 rounded mb-3" />
      <div className="h-8 w-16 bg-gray-700 rounded" />
    </div>
  );
}

// ── Success Rate Radial ───────────────────────────────────────────────────────

function SuccessRateChart({ rate }) {
  const data = [{ name: 'Success', value: rate, fill: '#6366f1' }];
  return (
    <div className="card flex flex-col gap-1">
      <p className="text-xs text-gray-500 uppercase tracking-wider">Success Rate</p>
      {rate === null ? (
        <p className="text-2xl font-bold text-white mt-1">—</p>
      ) : (
        <div className="flex items-center gap-2">
          <div className="w-16 h-16">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                cx="50%"
                cy="50%"
                innerRadius="60%"
                outerRadius="100%"
                barSize={8}
                data={data}
                startAngle={90}
                endAngle={90 - (360 * rate) / 100}
              >
                <RadialBar dataKey="value" cornerRadius={4} />
                <Tooltip
                  formatter={(v) => [`${v}%`, 'Success']}
                  contentStyle={{ background: '#1f2937', border: 'none', borderRadius: 8, fontSize: 12 }}
                  itemStyle={{ color: '#e5e7eb' }}
                />
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-3xl font-bold text-indigo-400">{rate}%</p>
        </div>
      )}
    </div>
  );
}

// ── Individual Stat Card ──────────────────────────────────────────────────────

function StatWidget({ label, value, icon, color = 'text-white', sub }) {
  return (
    <div className="card flex flex-col gap-2 group hover:border-indigo-500/40 transition-colors duration-200">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
        <span className="text-lg opacity-60 group-hover:opacity-100 transition-opacity">{icon}</span>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value ?? '—'}</p>
      {sub && <p className="text-xs text-gray-600">{sub}</p>}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function StatWidgets({ address }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!address) { setLoading(false); return; }

    setLoading(true);
    fetch(`${API_BASE}/api/escrows/stats/${address}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setStats(data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [address]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3">
        ⚠️ Could not load stats: {error}
      </div>
    );
  }

  // Empty state — user has no escrows yet
  if (!stats || stats.total === 0) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatWidget label="Total Escrows" value={0} icon="📦" />
        <StatWidget label="Active" value={0} icon="🔒" color="text-indigo-400" />
        <StatWidget label="Completed" value={0} icon="✅" color="text-emerald-400" />
        <StatWidget label="Disputed" value={0} icon="⚠️" color="text-amber-400" />
        <StatWidget label="Total Locked" value="0" icon="💰" sub="USDC" />
        <SuccessRateChart rate={null} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <StatWidget label="Total Escrows" value={stats.total} icon="📦" />
      <StatWidget label="Active" value={stats.active} icon="🔒" color="text-indigo-400" />
      <StatWidget label="Completed" value={stats.completed} icon="✅" color="text-emerald-400" />
      <StatWidget label="Disputed" value={stats.disputed} icon="⚠️" color="text-amber-400" />
      <StatWidget
        label="Total Locked"
        value={stats.totalValueLocked ? Number(BigInt(stats.totalValueLocked) / BigInt(1e7)).toLocaleString() : '0'}
        icon="💰"
        sub="stroops → tokens"
      />
      <SuccessRateChart rate={stats.successRate} />
    </div>
  );
}
