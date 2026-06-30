'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ReputationBadge from '../../components/ui/ReputationBadge';
import Badge from '../../components/ui/Badge';
import StatCard from '../../components/ui/StatCard';
import EscrowCard from '../../components/escrow/EscrowCard';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import ErrorBoundary from '../../components/error/ErrorBoundary';
import TruncatedAddress from '../../components/ui/TruncatedAddress';
import { useWalletStore } from '../../store/app-store';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const STATUS_GROUPS = ['Active', 'Completed', 'Disputed', 'Cancelled'];

export default function ProfilePage() {
  const { address } = useWalletStore();
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [escrows, setEscrows] = useState([]);
  const [recentlyResolved, setRecentlyResolved] = useState([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [escrowsLoading, setEscrowsLoading] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    if (!address) router.replace('/');
  }, [address, router]);

  useEffect(() => {
    if (!address) return;
    setStatsLoading(true);
    fetch(`${API_BASE}/api/users/me/stats`, {
      headers: { 'x-wallet-address': address },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setStats(data);
          setDisplayName(data.displayName || '');
          setNameInput(data.displayName || '');
        }
      })
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, [address]);

  useEffect(() => {
    if (!address) return;
    setEscrowsLoading(true);
    fetch(`${API_BASE}/api/users/me/escrows`, {
      headers: { 'x-wallet-address': address },
    })
      .then((r) => r.ok ? r.json() : { escrows: [] })
      .then(({ escrows: list = [] }) => {
        const normalised = list.map((e) => ({
          id: String(e.id),
          title: `Escrow #${e.id}`,
          status: e.status,
          totalAmount: `${Number(e.totalAmount || 0).toLocaleString()} USDC`,
          milestoneProgress: '0 / 0',
          counterparty: e.counterpartyAddress
            ? `${e.counterpartyAddress.slice(0, 4)}…${e.counterpartyAddress.slice(-4)}`
            : '—',
          role: e.role || 'client',
          completedAt: e.completedAt || null,
        }));
        setEscrows(normalised);
        setRecentlyResolved(
          normalised
            .filter((e) => e.status === 'Completed')
            .sort((a, b) => (b.completedAt || '') > (a.completedAt || '') ? 1 : -1)
            .slice(0, 5),
        );
      })
      .catch(() => setEscrows([]))
      .finally(() => setEscrowsLoading(false));
  }, [address]);

  const handleSaveName = async () => {
    if (!nameInput.trim()) return;
    setSavingName(true);
    try {
      const res = await fetch(`${API_BASE}/api/users/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': address,
        },
        body: JSON.stringify({ displayName: nameInput.trim() }),
      });
      if (res.ok) {
        setDisplayName(nameInput.trim());
        setEditingName(false);
      }
    } catch {
      // silent — user can retry
    } finally {
      setSavingName(false);
    }
  };

  if (!address) return null;

  const escrowsByStatus = STATUS_GROUPS.reduce((acc, status) => {
    const group = escrows.filter((e) => e.status === status);
    if (group.length) acc[status] = group;
    return acc;
  }, {});

  return (
    <div className="space-y-10 max-w-4xl mx-auto">
      {/* Profile header */}
      <ErrorBoundary>
        <div className="card flex flex-col sm:flex-row gap-6 items-start">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600/30 flex items-center justify-center text-indigo-300 font-bold text-xl flex-shrink-0">
            {address.slice(1, 3).toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            {/* Display name */}
            {editingName ? (
              <div className="flex items-center gap-2 mb-2">
                <input
                  className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-white text-sm w-48"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                  autoFocus
                />
                <Button size="sm" onClick={handleSaveName} isLoading={savingName}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditingName(false); setNameInput(displayName); }}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl font-bold text-white">
                  {displayName || <TruncatedAddress address={address} />}
                </h1>
                <button
                  onClick={() => setEditingName(true)}
                  className="text-xs text-gray-500 hover:text-indigo-400 transition-colors"
                  aria-label="Edit display name"
                >
                  ✏
                </button>
              </div>
            )}
            <p className="text-xs text-gray-500 font-mono mb-2 truncate">{address}</p>
            {stats?.memberSince && (
              <p className="text-gray-500 text-sm">Member since {stats.memberSince}</p>
            )}
          </div>

          <div className="text-center shrink-0">
            {stats?.reputationScore != null && (
              <>
                <ReputationBadge score={stats.reputationScore} size="lg" />
                <p className="text-xs text-gray-500 mt-1">Reputation</p>
              </>
            )}
            <div className="mt-3">
              <Link href={`/profile/${address}`}>
                <Button variant="secondary" size="sm">Public Profile</Button>
              </Link>
            </div>
          </div>
        </div>
      </ErrorBoundary>

      {/* Summary stats */}
      <ErrorBoundary>
        <section aria-label="Account statistics" data-testid="profile-stats">
          <h2 className="text-lg font-semibold text-white mb-4">Overview</h2>
          {statsLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Total Escrows" value={stats?.totalEscrows ?? '—'} icon="📋" />
              <StatCard label="Total Volume" value={stats?.totalVolume ? `${Number(stats.totalVolume).toLocaleString()} USDC` : '—'} icon="💰" />
              <StatCard label="Dispute Rate" value={stats?.disputeRate != null ? `${stats.disputeRate}%` : '—'} icon="⚖️" />
              <StatCard label="Completion Rate" value={stats?.completionRate != null ? `${stats.completionRate}%` : '—'} icon="✅" />
            </div>
          )}
        </section>
      </ErrorBoundary>

      {/* Recently resolved */}
      {recentlyResolved.length > 0 && (
        <ErrorBoundary>
          <section aria-label="Recently resolved escrows">
            <h2 className="text-lg font-semibold text-white mb-4">Recently Resolved</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {recentlyResolved.map((e) => (
                <EscrowCard key={e.id} escrow={e} />
              ))}
            </div>
          </section>
        </ErrorBoundary>
      )}

      {/* Escrows grouped by status */}
      <ErrorBoundary>
        <section aria-label="All escrows">
          <h2 className="text-lg font-semibold text-white mb-4">Your Escrows</h2>
          {escrowsLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : escrows.length === 0 ? (
            <div className="card text-center py-10">
              <p className="text-gray-400">No escrows yet.</p>
              <Button href="/escrow/create" variant="primary" className="mt-4">
                Create your first escrow
              </Button>
            </div>
          ) : (
            <div className="space-y-8">
              {Object.entries(escrowsByStatus).map(([status, group]) => (
                <div key={status}>
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    {status} ({group.length})
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    {group.map((e) => <EscrowCard key={e.id} escrow={e} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </ErrorBoundary>
    </div>
  );
}
