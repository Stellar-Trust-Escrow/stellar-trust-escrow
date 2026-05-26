'use client';

/**
 * Admin — Dispute Resolution Page
 *
 * Lists all disputes (with escrow details). Admins can resolve open disputes
 * by specifying client and freelancer payout amounts.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAdminStore } from '../../../store/app-store';
import { adminFetch } from '../../../store/admin';

function ResolveModal({ dispute, onClose, onConfirm }) {
  const [clientAmount, setClientAmount] = useState('');
  const [freelancerAmount, setFreelancerAmount] = useState('');
  const [notes, setNotes] = useState('');

  if (!dispute) return null;

  const totalAmount = dispute.escrow?.totalAmount || '?';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-lg mx-4">
        <h3 className="text-lg font-semibold text-white mb-1">Resolve Dispute #{dispute.id}</h3>
        <p className="text-sm text-gray-400 mb-1">
          Escrow ID: <span className="font-mono">{dispute.escrowId?.toString()}</span>
        </p>
        <p className="text-sm text-gray-400 mb-4">
          Total amount: <span className="text-white">{totalAmount}</span>
        </p>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">
              Client Amount
            </label>
            <input
              type="text"
              value={clientAmount}
              onChange={(e) => setClientAmount(e.target.value)}
              placeholder="e.g. 500"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">
              Freelancer Amount
            </label>
            <input
              type="text"
              value={freelancerAmount}
              onChange={(e) => setFreelancerAmount(e.target.value)}
              placeholder="e.g. 500"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Resolution notes (optional)…"
          rows={2}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 mb-4 resize-none"
        />

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm({ clientAmount, freelancerAmount, notes })}
            disabled={!clientAmount || !freelancerAmount}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Confirm Resolution
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ resolved }) {
  return resolved ? (
    <span className="badge-completed text-xs px-2 py-0.5 rounded-full">Resolved</span>
  ) : (
    <span className="badge-disputed text-xs px-2 py-0.5 rounded-full">Open</span>
  );
}

export default function AdminDisputesPage() {
  const { apiKey } = useAdminStore();
  const [disputes, setDisputes] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 1 });
  const [filter, setFilter] = useState('false'); // 'false'=open, 'true'=resolved, ''=all
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [selectedDispute, setSelectedDispute] = useState(null);

  const fetchDisputes = useCallback(async (page = 1, resolved = 'false') => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page, limit: 20 });
      if (resolved !== '') params.set('resolved', resolved);
      const res = await adminFetch(`/api/admin/disputes?${params}`, apiKey);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch disputes');
      setDisputes(data.disputes);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    fetchDisputes(1, filter);
  }, [apiKey, filter, fetchDisputes]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const handleResolve = async ({ clientAmount, freelancerAmount, notes }) => {
    const id = selectedDispute.id;
    setSelectedDispute(null);
    try {
      const res = await adminFetch(
        `/api/admin/disputes/${id}/resolve`,
        apiKey,
        {
          method: 'POST',
          body: JSON.stringify({ clientAmount, freelancerAmount, notes }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resolve dispute');
      showToast('Dispute resolved successfully.');
      fetchDisputes(pagination.page, filter);
    } catch (err) {
      setError(err.message);
    }
  };

  const filterTabs = [
    { label: 'Open', value: 'false' },
    { label: 'Resolved', value: 'true' },
    { label: 'All', value: '' },
  ];

  return (
    <div>
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-emerald-800 border border-emerald-500/40 text-emerald-100 text-sm px-4 py-3 rounded-lg shadow-xl">
          ✅ {toast}
        </div>
      )}
      <ResolveModal
        dispute={selectedDispute}
        onClose={() => setSelectedDispute(null)}
        onConfirm={handleResolve}
      />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Dispute Resolution</h1>
          <p className="text-gray-400 text-sm mt-1">{pagination.total} disputes found</p>
        </div>
        <a
          href="/admin"
          className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          ← Dashboard
        </a>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 bg-gray-900 border border-gray-800 rounded-lg p-1 w-fit">
        {filterTabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setFilter(t.value)}
            className={`text-sm px-4 py-1.5 rounded-md transition-colors ${filter === t.value ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3 mb-4">
          ⚠️ {error}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading…</div>
        ) : disputes.length === 0 ? (
          <div className="card text-center py-12 text-gray-500">No disputes found.</div>
        ) : (
          disputes.map((d) => (
            <div key={d.id} className="card">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white font-semibold">Dispute #{d.id}</span>
                    <StatusBadge resolved={!!d.resolvedAt} />
                  </div>
                  <p className="text-xs text-gray-500 mb-2">
                    Escrow:{' '}
                    <span className="font-mono text-gray-400">{d.escrowId?.toString()}</span>
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-xs text-gray-400">
                    <span>
                      Client:{' '}
                      <span className="font-mono text-gray-300">
                        {d.escrow?.clientAddress?.slice(0, 12)}…
                      </span>
                    </span>
                    <span>
                      Freelancer:{' '}
                      <span className="font-mono text-gray-300">
                        {d.escrow?.freelancerAddress?.slice(0, 12)}…
                      </span>
                    </span>
                    <span>
                      Total: <span className="text-white">{d.escrow?.totalAmount}</span>
                    </span>
                    <span>
                      Raised:{' '}
                      <span className="text-gray-300">
                        {new Date(d.raisedAt).toLocaleDateString()}
                      </span>
                    </span>
                    {d.resolvedAt && (
                      <>
                        <span>
                          Client payout: <span className="text-emerald-400">{d.clientAmount}</span>
                        </span>
                        <span>
                          Freelancer payout:{' '}
                          <span className="text-emerald-400">{d.freelancerAmount}</span>
                        </span>
                      </>
                    )}
                  </div>
                </div>
                {!d.resolvedAt && (
                  <button
                    id={`resolve-dispute-${d.id}`}
                    onClick={() => setSelectedDispute(d)}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shrink-0"
                  >
                    Resolve
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => fetchDisputes(pagination.page - 1, filter)}
            disabled={pagination.page <= 1}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ← Prev
          </button>
          <span className="text-sm text-gray-500 px-2 py-1.5">
            {pagination.page} / {pagination.pages}
          </span>
          <button
            onClick={() => fetchDisputes(pagination.page + 1, filter)}
            disabled={pagination.page >= pagination.pages}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
