'use client';

export const dynamic = 'force-dynamic';

/**
 * Admin Dashboard — Main Overview Page
 *
 * Shows platform-wide metrics, arbiter management, and dispute queue.
 * Protected by requireRole("admin") HOC.
 *
 * Access uses the shared frontend store, which persists the admin API key
 * for subsequent sessions and injects it into the `x-admin-api-key` header.
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { useAdminStore } from '../../store/app-store';
import { buildAdminHeaders } from '../../store/admin';
import { requireRole } from '../../components/auth/requireRole';
import MetricsTile from '../../components/admin/MetricsTile';
import ArbiterTable from '../../components/admin/ArbiterTable';
import DisputeQueue from '../../components/admin/DisputeQueue';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// SWR fetcher for metrics
const fetcher = async (url) => {
  const apiKey = localStorage.getItem('ste-app-store')
    ? JSON.parse(localStorage.getItem('ste-app-store'))?.admin?.apiKey
    : null;

  if (!apiKey) throw new Error('Not authenticated');

  const res = await fetch(`${API_BASE}${url}`, {
    headers: buildAdminHeaders(apiKey, {}),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to fetch data');
  }

  return res.json();
};

function AdminDashboardContent() {
  const { apiKey, setApiKey, clearApiKey } = useAdminStore();
  const [inputKey, setInputKey] = useState('');
  const [error, setError] = useState('');
  const [arbiters, setArbiters] = useState([]);

  useEffect(() => {
    setInputKey(apiKey);
  }, [apiKey]);

  // Fetch metrics with SWR (30s polling)
  const { data: metrics, error: metricsError } = useSWR(
    apiKey ? '/api/v1/admin/metrics' : null,
    fetcher,
    {
      refreshInterval: 30000,
      revalidateOnFocus: false,
    },
  );

  const fetchArbiters = useCallback(async () => {
    if (!apiKey) return;

    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/arbiters`, {
        headers: buildAdminHeaders(apiKey, {}),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch arbiters');
      }

      const data = await res.json();
      setArbiters(data.arbiters || []);
    } catch (err) {
      console.error('Failed to fetch arbiters:', err);
    }
  }, [apiKey]);

  useEffect(() => {
    fetchArbiters();
  }, [fetchArbiters]);

  const handleLogin = (e) => {
    e.preventDefault();
    setApiKey(inputKey);
  };

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

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">🛡️</span>
          <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
        </div>
        <p className="text-gray-400">Platform management for StellarTrustEscrow administrators.</p>
      </div>

      {/* API Key Login */}
      {!apiKey && (
        <div className="card max-w-md mx-auto">
          <h2 className="text-lg font-semibold text-white mb-4">Admin Authentication</h2>
          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <input
              type="password"
              id="admin-api-key"
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              placeholder="Enter admin API key"
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              required
            />
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 rounded-lg transition-colors"
            >
              Authenticate
            </button>
          </form>
          {error && <p className="text-red-400 text-sm mt-3">⚠️ {error}</p>}
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
              onClick={() => {
                clearApiKey();
                setInputKey('');
                setArbiters([]);
              }}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              Sign out
            </button>
          </div>

          {metricsError && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg px-4 py-3 mb-6 text-red-400 text-sm">
              ⚠️ {metricsError.message}
            </div>
          )}

          {/* Metrics row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
            <MetricsTile
              label="Active Escrows"
              value={metrics?.activeEscrows}
              delta={metrics?.activeEscrowsDelta}
              deltaLabel="vs last week"
              icon="📦"
              color="text-indigo-400"
              improvementDirection="up"
            />
            <MetricsTile
              label="Locked XLM"
              value={metrics?.totalLockedXLM}
              delta={metrics?.totalLockedXLMDelta}
              deltaLabel="vs last week"
              icon="�"
              color="text-emerald-400"
              improvementDirection="up"
            />
            <MetricsTile
              label="Disputes This Week"
              value={metrics?.disputesThisWeek}
              delta={metrics?.disputesThisWeekDelta}
              deltaLabel="vs last week"
              icon="⚠️"
              color="text-amber-400"
              improvementDirection="down"
            />
            <MetricsTile
              label="Avg Resolution Time"
              value={metrics?.avgResolutionTime}
              delta={metrics?.avgResolutionTimeDelta}
              deltaLabel="vs last week"
              icon="⏱️"
              color="text-blue-400"
              improvementDirection="down"
            />
            <MetricsTile
              label="Platform Fees (Month)"
              value={metrics?.platformFeesMonth}
              delta={metrics?.platformFeesMonthDelta}
              deltaLabel="vs last month"
              icon="💎"
              color="text-purple-400"
              improvementDirection="up"
            />
          </div>

          {/* Arbiter Management */}
          <div className="mb-8">
            <ArbiterTable arbiters={arbiters} onRefresh={fetchArbiters} apiKey={apiKey} />
          </div>

          {/* Dispute Queue */}
          <div className="mb-8">
            <DisputeQueue apiKey={apiKey} />
          </div>

          {/* Nav cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="card group hover:border-indigo-500/50 hover:bg-gray-800/60 transition-all duration-200 flex items-center gap-4 no-underline"
              >
                <span className="text-3xl">{item.icon}</span>
                <div>
                  <p className="text-white font-semibold group-hover:text-indigo-300 transition-colors">
                    {item.label}
                  </p>
                  <p className="text-sm text-gray-500">{item.desc}</p>
                </div>
                <span className="ml-auto text-gray-600 group-hover:text-indigo-400 transition-colors">
                  →
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default AdminDashboardContent;
