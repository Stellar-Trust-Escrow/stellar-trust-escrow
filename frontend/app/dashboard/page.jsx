'use client';

import { useState, useEffect, Suspense } from 'react';
import dynamic from 'next/dynamic';
import EscrowCard from '../../components/escrow/EscrowCard';
import ReputationBadge from '../../components/ui/ReputationBadge';
import Button from '../../components/ui/Button';
import CardSkeleton from '../../components/ui/CardSkeleton';
import PageTransition from '../../components/layout/PageTransition';
import ErrorBoundary from '../../components/error/ErrorBoundary';
import { usePerformance } from '../../hooks/usePerformance';
import { useI18n } from '../../i18n/index.jsx';

const StatWidgets = dynamic(() => import('../../components/dashboard/StatWidgets'), {
  ssr: false,
  loading: () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="card animate-pulse">
          <div className="h-3 w-20 bg-gray-700 rounded mb-3" />
          <div className="h-8 w-16 bg-gray-700 rounded" />
        </div>
      ))}
    </div>
  ),
});

const ActivityTimeline = dynamic(() => import('../../components/dashboard/ActivityTimeline'), {
  loading: () => (
    <div className="card animate-pulse space-y-4">
      <div className="h-5 w-36 bg-gray-700 rounded" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-3 w-full bg-gray-800 rounded" />
      ))}
    </div>
  ),
});

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const PLACEHOLDER_ADDRESS = 'GABCD1234';

export default function DashboardPage() {
  const { t } = useI18n();
  const [escrows, setEscrows] = useState([]);
  const [escrowsLoading, setEscrowsLoading] = useState(true);
  const [reputation, setReputation] = useState(null);
  const { measureAsync } = usePerformance('DashboardPage');

  useEffect(() => {
    setEscrowsLoading(true);
    measureAsync('fetch-escrows', () =>
      fetch(`${API_BASE}/api/users/${PLACEHOLDER_ADDRESS}/escrows?status=Active&limit=6`)
        .then((r) => r.json())
        .then((data) => {
          setEscrows(Array.isArray(data?.escrows) ? data.escrows : []);
        })
        .catch(() => setEscrows([])),
    ).finally(() => setEscrowsLoading(false));
  }, [measureAsync]);

  useEffect(() => {
    fetch(`${API_BASE}/api/reputation/${PLACEHOLDER_ADDRESS}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data?.error) setReputation(data);
      })
      .catch(() => {});
  }, []);

  const reputationScore = reputation?.totalScore
    ? Math.min(100, Math.round(Number(reputation.totalScore) / 100))
    : null;

  return (
    <PageTransition>
      <ErrorBoundary>
        <div className="space-y-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">{t('nav.dashboard')}</h1>
              <p className="text-gray-400 mt-1">Welcome back.</p>
            </div>
            <div className="flex items-center gap-3">
              {reputationScore !== null && <ReputationBadge score={reputationScore} />}
              <Button href="/escrow/create" variant="primary">
                + {t('escrow.create')}
              </Button>
            </div>
          </div>

          <section>
            <Suspense fallback={<div className="h-40 card animate-pulse" />}>
              <StatWidgets address={PLACEHOLDER_ADDRESS} />
            </Suspense>
          </section>

          <Suspense fallback={<div className="h-40 card animate-pulse" />}>
            <ActivityTimeline address={PLACEHOLDER_ADDRESS} />
          </Suspense>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">Your Active Escrows</h2>
            {escrowsLoading ? (
              <div className="grid gap-4 md:grid-cols-2">
                <CardSkeleton />
                <CardSkeleton />
                <CardSkeleton />
              </div>
            ) : escrows.length === 0 ? (
              <div className="card text-center py-10">
                <p className="text-gray-400 font-medium">No active escrows yet.</p>
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
      </ErrorBoundary>
    </PageTransition>
  );
}
