/**
 * Public Explorer Page — /explorer
 *
 * Browse all escrows on the platform. No wallet connection required.
 * Useful for transparency and discovering active projects.
 *
 * TODO (contributor — medium, Issue #36):
 * - Fetch: GET /api/escrows?page=1&limit=20
 * - Add filter controls: status, date range, token, amount range
 * - Add search by client/freelancer address
 * - Add sorting: newest, highest value, most milestones
 * - Implement URL-based filter state (query params) so filters are shareable
 */

'use client';

import { useState } from 'react';
import EscrowCard from '../../components/escrow/EscrowCard';
import Button from '../../components/ui/Button';

// TODO (contributor): replace with SWR-fetched data
const PLACEHOLDER_ESCROWS = [
  {
    id: 1,
    title: 'Website Redesign',
    status: 'Active',
    totalAmount: '800 USDC',
    milestoneProgress: '1 / 3',
    counterparty: 'GABC...1234',
    role: 'client',
  },
  {
    id: 2,
    title: 'API Development',
    status: 'Active',
    totalAmount: '3,000 USDC',
    milestoneProgress: '2 / 5',
    counterparty: 'GXYZ...5678',
    role: 'freelancer',
  },
  {
    id: 3,
    title: 'Logo Package',
    status: 'Completed',
    totalAmount: '300 USDC',
    milestoneProgress: '4 / 4',
    counterparty: 'GDEF...9012',
    role: 'client',
  },
  {
    id: 4,
    title: 'Smart Contract',
    status: 'Disputed',
    totalAmount: '5,000 USDC',
    milestoneProgress: '2 / 4',
    counterparty: 'GHIJ...3456',
    role: 'client',
  },
];

const STATUS_FILTERS = ['All', 'Active', 'Completed', 'Disputed', 'Cancelled'];

export default function ExplorerPage() {
  const [activeFilter, setActiveFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // TODO (contributor — Issue #36): implement real filtering with URL query params
  const filteredEscrows = PLACEHOLDER_ESCROWS.filter((e) => {
    if (activeFilter !== 'All' && e.status !== activeFilter) return false;
    if (searchQuery && !e.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Escrow Explorer</h1>
        <p className="text-gray-400 mt-1">
          Browse all public escrow agreements on StellarTrustEscrow.
        </p>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Search by title or address…"
          className="flex-1 bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5
                     text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="flex flex-wrap gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                ${
                  activeFilter === f ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      {/*
        TODO (contributor — Issue #36):
        Show platform-wide stats: total escrows, total value locked, total users
      */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center text-sm">
        <div className="card py-3">
          <p className="text-gray-500">Total Escrows</p>
          <p className="text-white font-bold text-lg">—</p>
        </div>
        <div className="card py-3">
          <p className="text-gray-500">Total Locked</p>
          <p className="text-white font-bold text-lg">—</p>
        </div>
        <div className="card py-3">
          <p className="text-gray-500">Total Users</p>
          <p className="text-white font-bold text-lg">—</p>
        </div>
      </div>

      {/* Escrow Grid */}
      {filteredEscrows.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          No escrows found matching your filters.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredEscrows.map((escrow) => (
            <EscrowCard key={escrow.id} escrow={escrow} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {/*
        TODO (contributor — Issue #36): implement real pagination
      */}
      <div className="flex justify-center gap-2">
        <Button variant="secondary" size="sm" disabled>
          ← Prev
        </Button>
        <span className="px-4 py-2 text-sm text-gray-400">Page 1 of —</span>
        <Button variant="secondary" size="sm">
          Next →
        </Button>
      </div>
    </div>
  );
}
