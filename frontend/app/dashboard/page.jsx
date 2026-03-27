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
 * TODO (contributor — Issue #30): Replace PLACEHOLDER_ADDRESS with the real
 * connected wallet address from FreighterAPI / WalletProvider context.
 */

import { useState, useEffect } from 'react';
import EscrowCard from '../../components/escrow/EscrowCard';
import ReputationBadge from '../../components/ui/ReputationBadge';
import Button from '../../components/ui/Button';
import StatWidgets from '../../components/dashboard/StatWidgets';
import ActivityTimeline from '../../components/dashboard/ActivityTimeline';
import PageTransition from '../../components/layout/PageTransition';

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

  // Fetch active escrows for this address
  useEffect(() => {
    setEscrowsLoading(true);
    fetch(`${API_BASE}/api/users/${PLACEHOLDER_ADDRESS}/escrows?status=Active&limit=6`)
      .then((r) => r.json())
      .then((data) => {
        // API returns 501 until Issue #24 is implemented — fall back to empty
        if (data.error) {
          setEscrows([]);
        } else {
          setEscrows(Array.isArray(data.escrows) ? data.escrows : []);
        }
      })
      .catch(() => setEscrows([]))
      .finally(() => setEscrowsLoading(false));
  }, []);

  // Fetch reputation score
  useEffect(() => {
    fetch(`${API_BASE}/api/reputation/${PLACEHOLDER_ADDRESS}`)
      .then((r) => r.json())
      .then((data) => { if (!data.error) setReputation(data); })
      .catch(() => {});
  }, []);

  const reputationScore = reputation?.totalScore
    ? Math.min(100, Math.round(Number(reputation.totalScore) / 100))
    : null;

  return (
    <PageTransition>
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 mt-1">
            Welcome back,{' '}
            <span className="text-indigo-400 font-mono">
              {PLACEHOLDER_ADDRESS.slice(0, 8)}…
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {reputationScore !== null && (
            <ReputationBadge score={reputationScore} />
          )}
          <Button href="/escrow/create" variant="primary">
            + New Escrow
          </Button>
        </div>
      </div>

      {/* ── Analytics Widgets ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Overview</h2>
          <span className="text-xs text-gray-500">Refreshes on page load</span>
        </div>
        <StatWidgets address={PLACEHOLDER_ADDRESS} />
      </section>

      {/* ── Activity Timeline ── */}
      <ActivityTimeline address={PLACEHOLDER_ADDRESS} />

      {/* ── Active Escrows ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Your Active Escrows</h2>
          {escrows.length > 0 && (
            <a href="/escrow" className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
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
            <p className="text-gray-600 text-sm mt-1">
              Create your first escrow to get started.
            </p>
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
    </PageTransition>
  );
}
