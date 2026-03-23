'use client';

/**
 * Admin — Audit Logs Page
 *
 * Shows a paginated, read-only feed of every admin action.
 */

import { useState, useEffect, useCallback } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function getAdminKey() {
  return typeof window !== 'undefined' ? localStorage.getItem('adminApiKey') || '' : '';
}

function actionColor(action) {
  if (action?.includes('BAN')) return 'text-red-400 bg-red-500/10 border-red-500/20';
  if (action?.includes('SUSPEND')) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  if (action?.includes('RESOLVE')) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20';
}

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchLogs = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/audit-logs?page=${page}&limit=50`, {
        headers: { 'x-admin-api-key': getAdminKey() },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch audit logs');
      setLogs(data.logs);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLogs(1); }, [fetchLogs]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Logs</h1>
          <p className="text-gray-400 text-sm mt-1">{pagination.total} entries total</p>
        </div>
        <a href="/admin" className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">← Dashboard</a>
      </div>

      {error && <div className="bg-red-900/20 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3 mb-4">⚠️ {error}</div>}

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-xs text-gray-400 uppercase tracking-wider">
              <th className="text-left px-5 py-3">Action</th>
              <th className="text-left px-5 py-3 hidden sm:table-cell">Target</th>
              <th className="text-left px-5 py-3 hidden md:table-cell">Reason</th>
              <th className="text-right px-5 py-3">Performed At</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="text-center py-12 text-gray-500">Loading…</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-12 text-gray-500">No audit entries yet.</td></tr>
            ) : logs.map((log) => (
              <tr key={log.id} className="border-b border-gray-800/60 hover:bg-gray-800/20 transition-colors">
                <td className="px-5 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${actionColor(log.action)}`}>
                    {log.action}
                  </span>
                </td>
                <td className="px-5 py-3 hidden sm:table-cell font-mono text-gray-400 text-xs" title={log.targetAddress}>
                  {log.targetAddress?.length > 20 ? `${log.targetAddress.slice(0, 10)}…` : log.targetAddress}
                </td>
                <td className="px-5 py-3 hidden md:table-cell text-gray-500 max-w-xs truncate">{log.reason || '—'}</td>
                <td className="px-5 py-3 text-right text-gray-500 text-xs whitespace-nowrap">
                  {new Date(log.performedAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination.pages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => fetchLogs(pagination.page - 1)}
            disabled={pagination.page <= 1}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >← Prev</button>
          <span className="text-sm text-gray-500 px-2 py-1.5">{pagination.page} / {pagination.pages}</span>
          <button
            onClick={() => fetchLogs(pagination.page + 1)}
            disabled={pagination.page >= pagination.pages}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >Next →</button>
        </div>
      )}
    </div>
  );
}
