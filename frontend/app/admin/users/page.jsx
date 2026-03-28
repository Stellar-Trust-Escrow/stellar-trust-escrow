'use client';

/**
 * Admin — User Management Page
 *
 * Displays a paginated, searchable list of all users (reputation records).
 * Admins can view user details and suspend/ban users from this page.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAdminStore } from '../../../store/app-store';
import { adminFetch } from '../../../store/admin';

function truncate(str, len = 18) {
  if (!str) return '—';
  return str.length > len ? `${str.slice(0, 8)}…${str.slice(-6)}` : str;
}

function ActionModal({ user, action, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  if (!user) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold text-white mb-1 capitalize">{action} User</h3>
        <p className="text-sm text-gray-400 mb-4 break-all">{user.address}</p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={`Reason for ${action}…`}
          rows={3}
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
            onClick={() => onConfirm(reason)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors ${action === 'ban' ? 'bg-red-600 hover:bg-red-500' : 'bg-amber-600 hover:bg-amber-500'}`}
          >
            Confirm {action}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  const { apiKey } = useAdminStore();
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 1 });
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [modal, setModal] = useState({ user: null, action: '' });

  const fetchUsers = useCallback(async (page = 1, q = '') => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page, limit: 20, ...(q ? { search: q } : {}) });
      const res = await adminFetch(`/api/admin/users?${params}`, apiKey);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch users');
      setUsers(data.users);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    fetchUsers(1, search);
  }, [apiKey, search, fetchUsers]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const handleAction = async (reason) => {
    const { user, action } = modal;
    setModal({ user: null, action: '' });
    try {
      const res = await adminFetch(`/api/admin/users/${user.address}/${action}`, apiKey, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');
      showToast(`User ${action === 'ban' ? 'banned' : 'suspended'} successfully.`);
      fetchUsers(pagination.page, search);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-emerald-800 border border-emerald-500/40 text-emerald-100 text-sm px-4 py-3 rounded-lg shadow-xl">
          ✅ {toast}
        </div>
      )}
      <ActionModal
        user={modal.user}
        action={modal.action}
        onClose={() => setModal({ user: null, action: '' })}
        onConfirm={handleAction}
      />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">User Management</h1>
          <p className="text-gray-400 text-sm mt-1">{pagination.total} users total</p>
        </div>
        <a
          href="/admin"
          className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          ← Dashboard
        </a>
      </div>

      {/* Search */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setSearch(searchInput);
          }}
          placeholder="Search by Stellar address…"
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
        />
        <button
          onClick={() => setSearch(searchInput)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          Search
        </button>
        {search && (
          <button
            onClick={() => {
              setSearch('');
              setSearchInput('');
            }}
            className="text-sm text-gray-400 hover:text-white px-3 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3 mb-4">
          ⚠️ {error}
        </div>
      )}

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-xs text-gray-400 uppercase tracking-wider">
              <th className="text-left px-5 py-3">Address</th>
              <th className="text-right px-5 py-3">Score</th>
              <th className="text-right px-5 py-3 hidden sm:table-cell">Completed</th>
              <th className="text-right px-5 py-3 hidden md:table-cell">Disputes</th>
              <th className="text-right px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-gray-500">
                  No users found.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr
                  key={u.address}
                  className="border-b border-gray-800/60 hover:bg-gray-800/30 transition-colors"
                >
                  <td className="px-5 py-3 font-mono text-gray-300" title={u.address}>
                    {truncate(u.address, 30)}
                  </td>
                  <td className="px-5 py-3 text-right text-indigo-400 font-semibold">
                    {u.totalScore?.toString()}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-400 hidden sm:table-cell">
                    {u.completedEscrows}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-400 hidden md:table-cell">
                    {u.disputedEscrows}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <button
                        id={`suspend-${u.address}`}
                        onClick={() => setModal({ user: u, action: 'suspend' })}
                        className="text-xs bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 px-2 py-1 rounded transition-colors"
                      >
                        Suspend
                      </button>
                      <button
                        id={`ban-${u.address}`}
                        onClick={() => setModal({ user: u, action: 'ban' })}
                        className="text-xs bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/30 px-2 py-1 rounded transition-colors"
                      >
                        Ban
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => fetchUsers(pagination.page - 1, search)}
            disabled={pagination.page <= 1}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ← Prev
          </button>
          <span className="text-sm text-gray-500 px-2 py-1.5">
            {pagination.page} / {pagination.pages}
          </span>
          <button
            onClick={() => fetchUsers(pagination.page + 1, search)}
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
