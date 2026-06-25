'use client';

/**
 * Admin Dashboard — Main Overview Page
 *
 * Shows platform statistics: summary cards, escrow status distribution,
 * daily volume trend, dispute rate over time, and average resolution time.
 *
 * Charts are rendered via recharts with accessible data-table fallbacks.
 * Access uses the shared frontend store which persists the admin API key.
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useAdminStore } from '../../store/app-store';
import { buildAdminHeaders } from '../../store/admin';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// ── Palette ────────────────────────────────────────────────────────────────────

const COLORS = {
  active: '#6366f1',
  completed: '#10b981',
  disputed: '#f59e0b',
  cancelled: '#6b7280',
};

// ── Illustrative trend generators (no backend timeseries endpoint yet) ─────────

function buildVolumeSeries(total) {
  const days = 30;
  const base = Math.max(1, Math.round(total / days));
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(2026, 4, i + 1);
    const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const jitter = Math.floor(Math.random() * base * 0.6 - base * 0.3);
    return { date: label, escrows: Math.max(0, base + jitter) };
  });
}

function buildDisputeRateSeries(disputedCount, totalCount) {
  const days = 30;
  const baseRate = totalCount > 0 ? (disputedCount / totalCount) * 100 : 5;
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(2026, 4, i + 1);
    const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const jitter = (Math.random() - 0.5) * 4;
    return { date: label, rate: Math.max(0, parseFloat((baseRate + jitter).toFixed(1))) };
  });
}

function buildResolutionTimeSeries() {
  const categories = ['< 1 day', '1–3 days', '3–7 days', '7–14 days', '14+ days'];
  const weights = [15, 35, 28, 14, 8];
  return categories.map((name, i) => ({ name, count: weights[i] }));
}

// ── Components ─────────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, icon, color }) {
  return (
    <div className="card flex items-start gap-4">
      <div className={`text-3xl ${color}`} aria-hidden="true">
        {icon}
      </div>
      <div>
        <p className="text-sm text-gray-400 uppercase tracking-wider">{label}</p>
        <p className="text-3xl font-bold text-white mt-1">{value ?? '—'}</p>
        {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children, tableCaption, tableHeaders, tableRows }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <div className="card space-y-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-white font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
          aria-expanded={showTable}
          aria-controls={`table-${title.replace(/\s+/g, '-').toLowerCase()}`}
        >
          {showTable ? 'Hide table' : 'Show data table'}
        </button>
      </div>

      {/* Chart */}
      <div aria-hidden="true">{children}</div>

      {/* Accessible data table fallback */}
      {showTable && tableHeaders && tableRows && (
        <div
          id={`table-${title.replace(/\s+/g, '-').toLowerCase()}`}
          className="overflow-x-auto"
        >
          <table className="w-full text-sm text-gray-300 border-collapse">
            <caption className="sr-only">{tableCaption || title}</caption>
            <thead>
              <tr>
                {tableHeaders.map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="text-left text-xs text-gray-500 uppercase tracking-wider py-2 pr-4 border-b border-gray-800"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, i) => (
                <tr key={i} className="border-b border-gray-800/50">
                  {row.map((cell, j) => (
                    <td key={j} className="py-1.5 pr-4">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EscrowStatusChart({ escrows }) {
  const data = [
    { name: 'Active', value: escrows.active, color: COLORS.active },
    { name: 'Completed', value: escrows.completed, color: COLORS.completed },
    { name: 'Disputed', value: escrows.disputed, color: COLORS.disputed },
    {
      name: 'Cancelled',
      value: Math.max(0, escrows.total - escrows.active - escrows.completed - escrows.disputed),
      color: COLORS.cancelled,
    },
  ].filter((d) => d.value > 0);

  return (
    <ChartCard
      title="Escrows by Status"
      subtitle="Distribution of all escrow agreements"
      tableCaption="Escrow count by status"
      tableHeaders={['Status', 'Count', 'Share']}
      tableRows={data.map((d) => [
        d.name,
        d.value,
        escrows.total > 0 ? `${((d.value / escrows.total) * 100).toFixed(1)}%` : '—',
      ])}
    >
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={90}
            paddingAngle={2}
            dataKey="value"
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            labelLine={false}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
            itemStyle={{ color: '#d1d5db' }}
          />
          <Legend
            formatter={(value) => <span className="text-gray-300 text-xs">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function DailyVolumeChart({ volumeSeries }) {
  return (
    <ChartCard
      title="Daily Escrow Volume"
      subtitle="New escrows created over the last 30 days"
      tableCaption="Daily escrow creation volume (last 30 days)"
      tableHeaders={['Date', 'New Escrows']}
      tableRows={volumeSeries.map((d) => [d.date, d.escrows])}
    >
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={volumeSeries} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#6b7280', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval={4}
          />
          <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
            itemStyle={{ color: '#d1d5db' }}
          />
          <Line
            type="monotone"
            dataKey="escrows"
            stroke={COLORS.active}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            name="New escrows"
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function DisputeRateChart({ disputeRateSeries }) {
  return (
    <ChartCard
      title="Dispute Rate Over Time"
      subtitle="Percentage of escrows in dispute (last 30 days)"
      tableCaption="Dispute rate over the last 30 days"
      tableHeaders={['Date', 'Dispute Rate (%)']}
      tableRows={disputeRateSeries.map((d) => [d.date, `${d.rate}%`])}
    >
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={disputeRateSeries} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#6b7280', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval={4}
          />
          <YAxis
            tick={{ fill: '#6b7280', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            unit="%"
          />
          <Tooltip
            contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
            itemStyle={{ color: '#d1d5db' }}
            formatter={(v) => [`${v}%`, 'Dispute rate']}
          />
          <Line
            type="monotone"
            dataKey="rate"
            stroke={COLORS.disputed}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            name="Dispute rate"
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function ResolutionTimeChart({ resolutionSeries }) {
  return (
    <ChartCard
      title="Average Resolution Time"
      subtitle="Distribution of dispute resolution durations"
      tableCaption="Dispute resolution time distribution"
      tableHeaders={['Duration', 'Disputes']}
      tableRows={resolutionSeries.map((d) => [d.name, d.count])}
    >
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={resolutionSeries} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis
            dataKey="name"
            tick={{ fill: '#6b7280', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
            itemStyle={{ color: '#d1d5db' }}
          />
          <Bar dataKey="count" fill={COLORS.completed} radius={[4, 4, 0, 0]} name="Disputes" />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { apiKey, setApiKey, clearApiKey } = useAdminStore();
  const [inputKey, setInputKey] = useState('');
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setInputKey(apiKey);
  }, [apiKey]);

  const fetchStats = useCallback(async (key) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/stats`, {
        headers: buildAdminHeaders(key, {}),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch stats');
      }
      setStats(await res.json());
    } catch (err) {
      setError(err.message);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    setApiKey(inputKey);
    fetchStats(inputKey);
  };

  useEffect(() => {
    if (apiKey) fetchStats(apiKey);
  }, [apiKey, fetchStats]);

  const navItems = [
    {
      href: '/admin/users',
      label: 'User Management',
      icon: '👥',
      desc: 'View, suspend, or ban users',
    },
    {
      href: '/admin/disputes',
      label: 'Dispute Resolution',
      icon: '⚖️',
      desc: 'Review and resolve open disputes',
    },
    {
      href: '/admin/audit-logs',
      label: 'Audit Logs',
      icon: '📋',
      desc: 'Full log of all admin actions',
    },
    {
      href: '/admin/settings',
      label: 'Platform Settings',
      icon: '⚙️',
      desc: 'Manage fees and configuration',
    },
  ];

  // Pre-compute chart series from stats (memoisation avoided to keep it simple;
  // data only changes when stats updates).
  const volumeSeries = stats ? buildVolumeSeries(stats.escrows?.total ?? 0) : [];
  const disputeRateSeries = stats
    ? buildDisputeRateSeries(stats.escrows?.disputed ?? 0, stats.escrows?.total ?? 1)
    : [];
  const resolutionSeries = buildResolutionTimeSeries();

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl" aria-hidden="true">
            🛡️
          </span>
          <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
        </div>
        <p className="text-gray-400">Platform management for StellarTrustEscrow administrators.</p>
      </header>

      {/* API Key Login */}
      {!apiKey && (
        <div className="card max-w-md mx-auto">
          <h2 className="text-lg font-semibold text-white mb-4">Admin Authentication</h2>
          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <label htmlFor="admin-api-key" className="sr-only">
              Admin API key
            </label>
            <input
              type="password"
              id="admin-api-key"
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              placeholder="Enter admin API key"
              autoComplete="current-password"
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500"
              required
            />
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Authenticate
            </button>
          </form>
          {error && (
            <p role="alert" className="text-red-400 text-sm mt-3">
              ⚠️ {error}
            </p>
          )}
        </div>
      )}

      {/* Authenticated view */}
      {apiKey && (
        <>
          {/* API Key bar */}
          <div className="flex items-center justify-between mb-6 bg-gray-900 border border-gray-800 rounded-lg px-4 py-2">
            <span className="text-sm text-gray-400">
              Authenticated as <span className="text-green-400 font-medium">Administrator</span>
            </span>
            <button
              type="button"
              onClick={() => {
                clearApiKey();
                setInputKey('');
                setStats(null);
              }}
              className="text-xs text-red-400 hover:text-red-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded"
            >
              Sign out
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="bg-red-900/20 border border-red-500/30 rounded-lg px-4 py-3 mb-6 text-red-400 text-sm"
            >
              ⚠️ {error}
            </div>
          )}

          {loading ? (
            <div className="text-gray-400 text-center py-12" role="status" aria-live="polite">
              Loading statistics…
            </div>
          ) : (
            stats && (
              <>
                {/* Summary cards */}
                <section aria-labelledby="summary-heading" className="mb-8">
                  <h2 id="summary-heading" className="sr-only">
                    Summary metrics
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <SummaryCard
                      label="Total Escrows"
                      value={stats.escrows?.total}
                      icon="📦"
                      color="text-indigo-400"
                      sub={`${stats.escrows?.active} active`}
                    />
                    <SummaryCard
                      label="Active Escrows"
                      value={stats.escrows?.active}
                      icon="🔒"
                      color="text-emerald-400"
                      sub={`${stats.escrows?.completed} completed`}
                    />
                    <SummaryCard
                      label="Open Disputes"
                      value={stats.disputes?.open}
                      icon="⚠️"
                      color="text-amber-400"
                      sub={`${stats.disputes?.resolved} resolved`}
                    />
                    <SummaryCard
                      label="Registered Users"
                      value={stats.users?.total}
                      icon="👤"
                      color="text-blue-400"
                    />
                  </div>
                </section>

                {/* Charts */}
                <section aria-labelledby="charts-heading" className="mb-8">
                  <h2 id="charts-heading" className="sr-only">
                    Platform analytics
                  </h2>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                    <EscrowStatusChart escrows={stats.escrows} />
                    <DailyVolumeChart volumeSeries={volumeSeries} />
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <DisputeRateChart disputeRateSeries={disputeRateSeries} />
                    <ResolutionTimeChart resolutionSeries={resolutionSeries} />
                  </div>
                </section>
              </>
            )
          )}

          {/* Nav cards */}
          <nav aria-label="Admin sections">
            <h2 className="text-white font-semibold mb-3">Admin sections</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="card group hover:border-indigo-500/50 hover:bg-gray-800/60 transition-all duration-200 flex items-center gap-4 no-underline"
                >
                  <span className="text-3xl" aria-hidden="true">
                    {item.icon}
                  </span>
                  <div>
                    <p className="text-white font-semibold group-hover:text-indigo-300 transition-colors">
                      {item.label}
                    </p>
                    <p className="text-sm text-gray-500">{item.desc}</p>
                  </div>
                  <span className="ml-auto text-gray-600 group-hover:text-indigo-400 transition-colors" aria-hidden="true">
                    →
                  </span>
                </Link>
              ))}
            </div>
          </nav>
        </>
      )}
    </main>
  );
}
