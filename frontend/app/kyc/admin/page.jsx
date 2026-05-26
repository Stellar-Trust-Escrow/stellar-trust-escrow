'use client';

/**
 * KYC Admin Dashboard — /kyc/admin
 *
 * Lists all KYC verification records with status filtering.
 * TODO (contributor): protect this route with admin auth.
 */

import { useEffect, useState } from 'react';
import Badge from '../../../components/ui/Badge';
import Spinner from '../../../components/ui/Spinner';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const STATUSES = ['', 'Pending', 'Init', 'Processing', 'Approved', 'Declined'];

export default function KycAdminPage() {
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: 20 });
    if (statusFilter) params.set('status', statusFilter);

    fetch(`${API_BASE}/api/kyc/admin?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setRecords(d.data ?? []);
        setTotal(d.total ?? 0);
      })
      .finally(() => setLoading(false));
  }, [page, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">KYC Admin</h1>
        <p className="text-gray-400 text-sm">{total} total records</p>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {STATUSES.map((s) => (
          <button
            key={s || 'all'}
            onClick={() => {
              setStatusFilter(s);
              setPage(1);
            }}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              statusFilter === s
                ? 'bg-indigo-500 border-indigo-500 text-white'
                : 'border-gray-700 text-gray-400 hover:border-gray-500'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : records.length === 0 ? (
        <p className="text-gray-500 text-center py-12">No records found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-800">
                <th className="pb-3 pr-4">Address</th>
                <th className="pb-3 pr-4">Applicant ID</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Result</th>
                <th className="pb-3">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {records.map((r) => (
                <tr key={r.id} className="text-gray-300">
                  <td className="py-3 pr-4 font-mono text-xs">
                    {r.address.slice(0, 8)}…{r.address.slice(-6)}
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-gray-500">
                    {r.applicantId ?? '—'}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge status={r.status} size="sm" />
                  </td>
                  <td className="py-3 pr-4 text-xs text-gray-500">
                    {r.reviewResult ?? '—'}
                    {r.rejectLabels?.length > 0 && (
                      <span className="ml-1 text-red-400">({r.rejectLabels.join(', ')})</span>
                    )}
                  </td>
                  <td className="py-3 text-xs text-gray-500">
                    {new Date(r.updatedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > 20 && (
        <div className="flex gap-3 justify-center">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-4 py-1.5 rounded border border-gray-700 text-gray-400 disabled:opacity-40 text-sm"
          >
            Previous
          </button>
          <span className="text-gray-500 text-sm self-center">Page {page}</span>
          <button
            disabled={page * 20 >= total}
            onClick={() => setPage((p) => p + 1)}
            className="px-4 py-1.5 rounded border border-gray-700 text-gray-400 disabled:opacity-40 text-sm"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
