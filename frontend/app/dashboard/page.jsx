'use client';

/**
 * Dashboard Page — /dashboard
 *
 * Main landing page after wallet connection. Shows:
 * - Analytics stat widgets (total, active, completed escrows, success rate, TVL)
 * - Recent activity timeline
 * - Active escrow cards
 * - Quick action buttons
 *
 * Performance optimisations:
 * - StatWidgets (contains recharts) is dynamically imported to avoid loading
 *   the large charting bundle on initial page load
 * - ActivityTimeline is dynamically imported (below-the-fold)
 * - Component-level performance tracking via usePerformance hook
 *
 * TODO (contributor — Issue #30): Replace PLACEHOLDER_ADDRESS with the real
 * connected wallet address from FreighterAPI / WalletProvider context.
 */

import { useState, useEffect, Suspense } from 'react';
import dynamic from 'next/dynamic';
import EscrowCard from '../../components/escrow/EscrowCard';
import ReputationBadge from '../../components/ui/ReputationBadge';
import Button from '../../components/ui/Button';
import { usePerformance } from '../../hooks/usePerformance';

// ── Dynamic imports for heavy components ──────────────────────────────────────
// StatWidgets imports recharts (~200 KB) — only load when dashboard renders

const StatWidgets = dynamic(() => import('../../components/dashboard/StatWidgets'), {
  loading: () => (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="card animate-pulse">
          <div className="h-3 w-20 bg-gray-700 rounded mb-3" />
          <div className="h-8 w-16 bg-gray-700 rounded" />
        </div>
      ))}
    </div>
  ),
  ssr: false, // recharts uses browser APIs
});

const ActivityTimeline = dynamic(() => import('../../components/dashboard/ActivityTimeline'), {
  loading: () => (
    <div className="card animate-pulse space-y-4">
      <div className="h-5 w-36 bg-gray-700 rounded" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <div className="w-8 h-8 bg-gray-700 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-48 bg-gray-800 rounded" />
            <div className="h-3 w-32 bg-gray-800 rounded" />
          </div>
        </div>
      ))}
    </div>
  ),
});

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// TODO (contributor — Issue #30): replace with wallet context
const PLACEHOLDER_ADDRESS = 'GABCD1234';

// ── Skeleton ──────────────────────────────────────────────────────────────────

function EscrowCardSkeleton() {
  return (
    <div className="card animate-pulse">
      <div className="h-4 w-40 bg-gray-700 rounded mb-3" />
      <div className="h-3 w-28 bg-gray-800 rounded mb-2" />
      <div className="h-3 w-20 bg-gray-800 rounded" />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [escrows, setEscrows] = useState([]);
  const [escrowsLoading, setEscrowsLoading] = useState(true);
  const [reputation, setReputation] = useState(null);
  const { measureAsync } = usePerformance('DashboardPage');

  // Fetch active escrows for this address
  useEffect(() => {
    setEscrowsLoading(true);
    measureAsync('fetch-escrows', () =>
      fetch(`${API_BASE}/api/users/${PLACEHOLDER_ADDRESS}/escrows?status=Active&limit=6`)
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            setEscrows([]);
          } else {
            setEscrows(Array.isArray(data.escrows) ? data.escrows : []);
          }
        })
        .catch(() => setEscrows([])),
    ).finally(() => setEscrowsLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch reputation score
  useEffect(() => {
    fetch(`${API_BASE}/api/reputation/${PLACEHOLDER_ADDRESS}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setReputation(data);
      })
      .catch(() => {});
  }, []);

  const reputationScore = reputation?.totalScore
    ? Math.min(100, Math.round(Number(reputation.totalScore) / 100))
    : null;

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 mt-1">
            Welcome back,{' '}
            <span className="text-indigo-400 font-mono">{PLACEHOLDER_ADDRESS.slice(0, 8)}…</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {reputationScore !== null && <ReputationBadge score={reputationScore} />}
          <Button href="/escrow/create" variant="primary">
            + New Escrow
          </Button>
        </div>
      </div>

      {/* ── Analytics Widgets (dynamically imported — loads recharts on demand) ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Overview</h2>
          <span className="text-xs text-gray-500">Refreshes on page load</span>
        </div>
        <Suspense
          fallback={
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="card animate-pulse">
                  <div className="h-3 w-20 bg-gray-700 rounded mb-3" />
                  <div className="h-8 w-16 bg-gray-700 rounded" />
                </div>
              ))}
            </div>
          }
        >
          <StatWidgets address={PLACEHOLDER_ADDRESS} />
        </Suspense>
      </section>

      {/* ── Activity Timeline (dynamically imported) ── */}
      <Suspense
        fallback={
          <div className="card animate-pulse space-y-4">
            <div className="h-5 w-36 bg-gray-700 rounded" />
            <div className="h-3 w-48 bg-gray-800 rounded" />
            <div className="h-3 w-32 bg-gray-800 rounded" />
          </div>
        }
      >
        <ActivityTimeline address={PLACEHOLDER_ADDRESS} />
      </Suspense>

      {/* ── Active Escrows ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Your Active Escrows</h2>
          {escrows.length > 0 && (
            <a
              href="/escrow"
              className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              View all →
            </a>
          )}
        </div>

        {escrowsLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            <EscrowCardSkeleton />
            <EscrowCardSkeleton />
          </div>
        ) : escrows.length === 0 ? (
          <div className="card text-center py-10">
            <p className="text-3xl mb-2">📭</p>
            <p className="text-gray-400 font-medium">No active escrows</p>
            <p className="text-gray-600 text-sm mt-1">Create your first escrow to get started.</p>
            <div className="mt-4">
              <Button href="/escrow/create" variant="primary">
                + New Escrow
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {escrows.map((escrow) => (
              <EscrowCard key={escrow.id} escrow={escrow} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
