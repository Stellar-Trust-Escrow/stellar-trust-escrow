'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, Clock, ArrowUp, ArrowDown } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function DisputeQueue({ apiKey }) {
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortConfig, setSortConfig] = useState({
    key: 'escalationRisk',
    direction: 'desc',
  });

  useEffect(() => {
    fetchDisputes();
  }, [apiKey]);

  const fetchDisputes = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch(
        `${API_BASE}/api/v1/admin/disputes?status=open&orderBy=escalationRisk`,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-admin-api-key': apiKey,
          },
        },
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch disputes');
      }

      const data = await res.json();
      setDisputes(data.disputes || []);
    } catch (err) {
      setError(err.message);
      setDisputes([]);
    } finally {
      setLoading(false);
    }
  };

  const sortDisputes = (disputesToSort) => {
    if (!Array.isArray(disputesToSort)) return [];
    const { key, direction } = sortConfig;

    return [...disputesToSort].sort((a, b) => {
      let aValue = a[key];
      let bValue = b[key];

      // Handle escalation risk special sorting
      if (key === 'escalationRisk') {
        // Sort by escalation count (higher first), then by time until escalation (sooner first)
        const countCompare = (b.escalationCount || 0) - (a.escalationCount || 0);
        if (countCompare !== 0) return countCompare;

        const aTime = a.autoEscalateAt ? new Date(a.autoEscalateAt).getTime() : Infinity;
        const bTime = b.autoEscalateAt ? new Date(b.autoEscalateAt).getTime() : Infinity;
        return aTime - bTime;
      }

      // Handle date sorting
      if (key === 'raisedAt' || key === 'autoEscalateAt') {
        aValue = aValue ? new Date(aValue).getTime() : 0;
        bValue = bValue ? new Date(bValue).getTime() : 0;
      }

      if (aValue < bValue) return direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return null;
    return sortConfig.direction === 'asc' ? (
      <ArrowUp className="w-4 h-4 inline ml-1" />
    ) : (
      <ArrowDown className="w-4 h-4 inline ml-1" />
    );
  };

  const getSortAria = (key) => {
    if (sortConfig.key !== key) return 'none';
    return sortConfig.direction === 'asc' ? 'ascending' : 'descending';
  };

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString();
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleString();
  };

  const getTimeUntilEscalation = (autoEscalateAt) => {
    if (!autoEscalateAt) return '—';

    const now = new Date();
    const escalateTime = new Date(autoEscalateAt);
    const diffMs = escalateTime - now;

    if (diffMs <= 0) return 'Overdue';

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h`;
    return `${diffHours}h`;
  };

  const getEscalationRiskColor = (escalationCount, autoEscalateAt) => {
    if (!autoEscalateAt) return 'text-gray-400';

    const now = new Date();
    const escalateTime = new Date(autoEscalateAt);
    const diffHours = (escalateTime - now) / (1000 * 60 * 60);

    if (diffHours <= 0) return 'text-red-400';
    if (diffHours <= 24) return 'text-orange-400';
    if (escalationCount >= 2) return 'text-amber-400';
    return 'text-gray-400';
  };

  const sortedDisputes = sortDisputes(disputes);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white">Dispute Queue</h2>
        <button
          onClick={fetchDisputes}
          className="text-gray-400 hover:text-white transition-colors"
          aria-label="Refresh disputes"
        >
          ↻
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading disputes…</div>
      ) : error ? (
        <div className="bg-red-900/20 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
          ⚠️ {error}
        </div>
      ) : sortedDisputes.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p>No open disputes</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <caption className="sr-only">Table of open disputes sorted by escalation risk</caption>
            <thead>
              <tr className="border-b border-gray-700">
                <th
                  scope="col"
                  className="text-left py-3 px-4 text-gray-400 font-medium cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleSort('escrowId')}
                  aria-sort={getSortAria('escrowId')}
                >
                  Escrow ID {getSortIcon('escrowId')}
                </th>
                <th
                  scope="col"
                  className="text-left py-3 px-4 text-gray-400 font-medium cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleSort('raisedAt')}
                  aria-sort={getSortAria('raisedAt')}
                >
                  Raised At {getSortIcon('raisedAt')}
                </th>
                <th
                  scope="col"
                  className="text-left py-3 px-4 text-gray-400 font-medium cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleSort('currentArbiter')}
                  aria-sort={getSortAria('currentArbiter')}
                >
                  Current Arbiter {getSortIcon('currentArbiter')}
                </th>
                <th
                  scope="col"
                  className="text-left py-3 px-4 text-gray-400 font-medium cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleSort('escalationCount')}
                  aria-sort={getSortAria('escalationCount')}
                >
                  Escalations {getSortIcon('escalationCount')}
                </th>
                <th
                  scope="col"
                  className="text-left py-3 px-4 text-gray-400 font-medium cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleSort('autoEscalateAt')}
                  aria-sort={getSortAria('autoEscalateAt')}
                >
                  Time Until Escalate {getSortIcon('autoEscalateAt')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedDisputes.map((dispute) => (
                <tr
                  key={dispute.escrowId}
                  className="border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4">
                    <Link
                      href={`/escrow/${dispute.escrowId}`}
                      className="text-indigo-400 hover:text-indigo-300 font-medium"
                    >
                      {dispute.escrowId}
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-gray-400">{formatDateTime(dispute.raisedAt)}</td>
                  <td className="py-3 px-4">
                    {dispute.currentArbiter ? (
                      <code className="text-sm text-gray-300">{dispute.currentArbiter}</code>
                    ) : (
                      <span className="text-gray-500">Unassigned</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <span className="text-white">{dispute.escalationCount ?? 0}</span>
                      {dispute.escalationCount > 0 && (
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div
                      className={`flex items-center gap-2 ${getEscalationRiskColor(
                        dispute.escalationCount,
                        dispute.autoEscalateAt,
                      )}`}
                    >
                      <Clock className="w-4 h-4" />
                      <span>{getTimeUntilEscalation(dispute.autoEscalateAt)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
