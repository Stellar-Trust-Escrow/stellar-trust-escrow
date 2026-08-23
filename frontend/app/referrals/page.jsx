'use client';

/**
 * /referrals — user referral dashboard.
 *
 * Displays the user's referral code (with a shareable signup link), stats
 * cards (total referrals, pending earnings, total paid out), a paginated
 * activity table, and pre-filled share buttons for Twitter/X and Telegram.
 */

import { useState, useEffect, useCallback } from 'react';
import { CopyButton } from '../../components/ui/CopyButton';
import StatCard from '../../components/ui/StatCard';
import EmptyState from '../../components/ui/EmptyState';
import Spinner from '../../components/ui/Spinner';
import Button from '../../components/ui/Button';
import { useWallet } from '../../hooks/useWallet';
import api from '../../lib/api/client';

const PAGE_SIZE = 10;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://app.example.com';

function shareLink(code) {
  return `${SITE_URL}/signup?ref=${encodeURIComponent(code)}`;
}

function shareMessage(code) {
  return `I've been using StellarTrustEscrow for secure freelance escrow — join with my referral code ${code}:`;
}

export default function ReferralsPage() {
  const { address } = useWallet();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newCode, setNewCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [page, setPage] = useState(1);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/v1/referrals/my-stats');
      setStats(res.data);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load referral stats.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (address) fetchStats();
  }, [address, fetchStats]);

  const handleCreateCode = async (e) => {
    e.preventDefault();
    if (!newCode.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await api.post('/v1/referrals/codes', { code: newCode.trim() });
      setNewCode('');
      await fetchStats();
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to create referral code.');
    } finally {
      setCreating(false);
    }
  };

  if (!address) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <EmptyState
          title="Connect your wallet"
          description="Connect your Stellar wallet to view or create your referral code."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner />
      </div>
    );
  }

  const activity = stats?.topReferred ?? [];
  const totalPages = Math.max(1, Math.ceil(activity.length / PAGE_SIZE));
  const pageStart = (page - 1) * PAGE_SIZE;
  const pageRows = activity.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">Referrals</h1>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Earn a share of the platform fee whenever someone you refer completes an escrow.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {!stats?.code ? (
        <form onSubmit={handleCreateCode} className="card flex flex-col gap-3">
          <label htmlFor="referral-code" className="text-sm font-medium">
            Create your referral code
          </label>
          <div className="flex gap-2">
            <input
              id="referral-code"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              maxLength={32}
              placeholder="e.g. ALICE2026"
              className="flex-1 rounded-md border px-3 py-2 text-sm bg-transparent"
              pattern="[A-Za-z0-9_]{1,32}"
              title="1-32 alphanumeric characters or underscores"
            />
            <Button type="submit" disabled={creating || !newCode.trim()}>
              {creating ? 'Creating…' : 'Create code'}
            </Button>
          </div>
        </form>
      ) : (
        <div className="card flex flex-col gap-3">
          <p className="text-sm font-medium">Your referral code</p>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="rounded bg-black/20 px-3 py-1.5 text-lg font-mono">{stats.code}</code>
            <CopyButton text={shareLink(stats.code)} label="referral link" />
          </div>
          <p className="text-xs break-all" style={{ color: 'var(--color-text-muted)' }}>
            {shareLink(stats.code)}
          </p>
          <div className="flex gap-2 mt-1">
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                shareMessage(stats.code),
              )}&url=${encodeURIComponent(shareLink(stats.code))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm px-3 py-1.5 rounded-md border hover:bg-white/5"
            >
              Share on X
            </a>
            <a
              href={`https://t.me/share/url?url=${encodeURIComponent(
                shareLink(stats.code),
              )}&text=${encodeURIComponent(shareMessage(stats.code))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm px-3 py-1.5 rounded-md border hover:bg-white/5"
            >
              Share on Telegram
            </a>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Referrals" value={stats?.totalReferrals ?? 0} icon="👥" />
        <StatCard
          label="Pending Earnings"
          value={`${stats?.pendingEarnings ?? '0'} XLM`}
          icon="⏳"
        />
        <StatCard label="Total Paid Out" value={`${stats?.totalEarned ?? '0'} XLM`} icon="💰" />
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-3">Referral activity</h2>
        {pageRows.length === 0 ? (
          <EmptyState
            title="No referral activity yet"
            description="Once someone signs up with your code and completes an escrow, it'll show up here."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left" style={{ color: 'var(--color-text-muted)' }}>
                    <th className="py-2 pr-4">Escrow</th>
                    <th className="py-2 pr-4">Earned</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.escrowId} className="border-t border-white/5">
                      <td className="py-2 pr-4 font-mono">
                        #{row.escrowId.slice(0, 6)}…{row.escrowId.slice(-4)}
                      </td>
                      <td className="py-2 pr-4">{row.earnedXlm} XLM</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-3 text-sm">
                <Button
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span style={{ color: 'var(--color-text-muted)' }}>
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
