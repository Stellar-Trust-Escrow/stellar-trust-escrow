'use client';

/**
 * Admin Dashboard — Main Overview Page
 *
 * Shows platform statistics: total escrows, users, open disputes.
 * Links to sub-sections: users, disputes, audit logs, settings.
 *
 * Access requires the admin API key to be set in localStorage as
 * `adminApiKey`. The key is sent with every admin API call via the
 * `x-admin-api-key` header.
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function StatCard({ label, value, sub, icon, color }) {
  return (
    <div className={`card flex items-start gap-4`}>
      <div className={`text-3xl ${color}`}>{icon}</div>
      <div>
        <p className="text-sm text-gray-400 uppercase tracking-wider">{label}</p>
        <p className="text-3xl font-bold text-white mt-1">{value ?? '—'}</p>
        {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [apiKey, setApiKey] = useState('');
  const [inputKey, setInputKey] = useState('');
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Persist key in localStorage
  useEffect(() => {
    const stored = localStorage.getItem('adminApiKey') || '';
    setApiKey(stored);
    setInputKey(stored);
  }, []);

  const fetchStats = useCallback(
    async (key) => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${API_BASE}/api/admin/stats`, {
          headers: { 'x-admin-api-key': key },
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
    },
    [],
  );

  const handleLogin = (e) => {
    e.preventDefault();
    localStorage.setItem('adminApiKey', inputKey);
    setApiKey(inputKey);
    fetchStats(inputKey);
  };

  useEffect(() => {
    if (apiKey) fetchStats(apiKey);
  }, [apiKey, fetchStats]);

  const navItems = [
    { href: '/admin/users', label: 'User Management', icon: '👥', desc: 'View, suspend, or ban users' },
    { href: '/admin/disputes', label: 'Dispute Resolution', icon: '⚖️', desc: 'Review and resolve open disputes' },
    { href: '/admin/audit-logs', label: 'Audit Logs', icon: '📋', desc: 'Full log of all admin actions' },
    { href: '/admin/settings', label: 'Platform Settings', icon: '⚙️', desc: 'Manage fees and configuration' },
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
              onClick={() => { localStorage.removeItem('adminApiKey'); setApiKey(''); setInputKey(''); setStats(null); }}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              Sign out
            </button>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg px-4 py-3 mb-6 text-red-400 text-sm">
              ⚠️ {error}
            </div>
          )}

          {/* Stats grid */}
          {loading ? (
            <div className="text-gray-400 text-center py-12">Loading statistics…</div>
          ) : stats && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              <StatCard label="Total Escrows" value={stats.escrows?.total} icon="📦" color="text-indigo-400"
                sub={`${stats.escrows?.active} active · ${stats.escrows?.completed} completed`} />
              <StatCard label="Registered Users" value={stats.users?.total} icon="👤" color="text-emerald-400" />
              <StatCard label="Disputed Escrows" value={stats.escrows?.disputed} icon="⚠️" color="text-amber-400"
                sub={`${stats.disputes?.open} open · ${stats.disputes?.resolved} resolved`} />
            </div>
          )}

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
                <span className="ml-auto text-gray-600 group-hover:text-indigo-400 transition-colors">→</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
