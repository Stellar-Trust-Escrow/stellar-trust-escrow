'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ReputationCard from '../../../components/profile/ReputationCard';
import CopyButton from '../../../components/ui/CopyButton';
import TruncatedAddress from '../../../components/ui/TruncatedAddress';
import StatCard from '../../../components/ui/StatCard';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import Modal from '../../../components/ui/Modal';
import { useWallet } from '../../../hooks/useWallet';
import {
  generateIdenticon,
  getReputation,
  isValidStellarAddress,
  signIdentityMessage,
  verifyIdentitySignature,
} from '../../../lib/stellar';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const STATUS_ORDER = ['Active', 'Completed', 'Disputed', 'Cancelled'];

function formatXlm(stroops) {
  try {
    const value = BigInt(stroops || 0);
    const whole = value / 10_000_000n;
    const fraction = (value % 10_000_000n).toString().padStart(7, '0').replace(/0+$/, '');
    return fraction ? `${whole}.${fraction} XLM` : `${whole} XLM`;
  } catch {
    return '0 XLM';
  }
}

function averageVolume(totalVolume, totalEscrows) {
  if (!totalEscrows) return '0 XLM';

  try {
    return formatXlm(BigInt(totalVolume || 0) / BigInt(totalEscrows));
  } catch {
    return '0 XLM';
  }
}

export default function ProfilePage({ params }) {
  const { address } = params;
  const isValidAddress = isValidStellarAddress(address);
  const identicon = useMemo(() => generateIdenticon(address), [address]);
  const [reputation, setReputation] = useState(null);
  const [reputationLoading, setReputationLoading] = useState(isValidAddress);
  const [reputationError, setReputationError] = useState(null);
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(isValidAddress);
  const [statsError, setStatsError] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyMeta, setHistoryMeta] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(isValidAddress);
  const [historyError, setHistoryError] = useState(null);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [verification, setVerification] = useState(null);
  const [verificationError, setVerificationError] = useState(null);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const { address: walletAddress, isConnected } = useWallet();
  const isOwnProfile = isConnected && walletAddress === address;

  useEffect(() => {
    if (!isValidAddress) return;

    let cancelled = false;
    setReputationLoading(true);
    setReputationError(null);
    setReputation(null);

    getReputation(address)
      .then((record) => {
        if (!cancelled) setReputation(record);
      })
      .catch(() => {
        if (!cancelled) setReputationError('Reputation data is currently unavailable.');
      })
      .finally(() => {
        if (!cancelled) setReputationLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [address, isValidAddress]);

  useEffect(() => {
    if (!isValidAddress) return;

    const controller = new AbortController();
    setHistoryLoading(true);
    setHistoryError(null);
    setHistory([]);

    fetch(
      `${API_BASE}/api/users/${address}/escrows?role=all&page=${historyPage}&limit=10`,
      { signal: controller.signal },
    )
      .then((response) => {
        if (!response.ok) throw new Error(`History request failed: ${response.status}`);
        return response.json();
      })
      .then((result) => {
        setHistory(result.data ?? []);
        setHistoryMeta(result);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setHistoryError('Escrow history is currently unavailable.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false);
      });

    return () => controller.abort();
  }, [address, historyPage, isValidAddress]);

  const handleVerifyOwnership = async () => {
    if (!isOwnProfile) return;

    setVerificationLoading(true);
    setVerificationError(null);

    try {
      const signedIdentity = await signIdentityMessage(walletAddress);
      const verified = verifyIdentitySignature(
        signedIdentity.message,
        signedIdentity.signature,
        signedIdentity.publicKey,
      );
      setVerification({ ...signedIdentity, verified });
      setVerificationOpen(true);
    } catch (error) {
      setVerification(null);
      setVerificationError(error.message || 'Identity signing was cancelled.');
      setVerificationOpen(true);
    } finally {
      setVerificationLoading(false);
    }
  };

  useEffect(() => {
    if (!isValidAddress) return;

    const controller = new AbortController();
    setStatsLoading(true);
    setStatsError(null);
    setStats(null);

    fetch(`${API_BASE}/api/users/${address}/stats`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Stats request failed: ${response.status}`);
        return response.json();
      })
      .then(setStats)
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setStatsError('Escrow stats are currently unavailable.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setStatsLoading(false);
      });

    return () => controller.abort();
  }, [address, isValidAddress]);

  if (!isValidAddress) {
    return (
      <div className="card max-w-3xl mx-auto" role="alert">
        <h1 className="text-xl font-bold text-white">Invalid Stellar address</h1>
        <p className="text-gray-400 mt-2">
          The profile URL does not contain a valid Stellar public key.
        </p>
      </div>
    );
  }

  const totalEscrows = stats?.totalEscrows ?? 0;
  const statusCounts = stats?.escrowsByStatus ?? {};
  const totalVolume = reputation?.totalVolume ?? '0';

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <section className="card" aria-labelledby="profile-identity-heading">
        <div className="flex flex-col sm:flex-row gap-5 items-start">
          <svg
            viewBox="0 0 5 5"
            className="w-20 h-20 rounded-2xl flex-shrink-0"
            role="img"
            aria-label={`Identicon for ${address}`}
            shapeRendering="crispEdges"
          >
            <rect width="5" height="5" fill={identicon.background} />
            {identicon.cells.map((cell) => (
              <rect
                key={`${cell.x}-${cell.y}`}
                x={cell.x}
                y={cell.y}
                width="1"
                height="1"
                fill={identicon.color}
              />
            ))}
          </svg>

          <div className="min-w-0 flex-1">
            <h1 id="profile-identity-heading" className="text-2xl font-bold text-white">
              Identity
            </h1>
            <div className="flex flex-wrap items-center gap-3 mt-3">
              <TruncatedAddress address={address} className="text-base" />
              <CopyButton text={address} label="Address" />
            </div>
            <a
              href={`https://stellar.expert/explorer/${process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet' ? 'public' : 'testnet'}/account/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex mt-3 text-sm text-indigo-400 hover:text-indigo-300"
            >
              View on Stellar Expert
            </a>
            {isOwnProfile && (
              <div className="mt-4">
                <Button onClick={handleVerifyOwnership} isLoading={verificationLoading}>
                  Verify ownership
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>

      <ReputationCard
        reputation={reputation}
        isLoading={reputationLoading}
        error={reputationError}
      />

      <section className="space-y-4" aria-labelledby="profile-stats-heading">
        <h2 id="profile-stats-heading" className="text-xl font-semibold text-white">
          Escrow Stats
        </h2>

        {statsError && (
          <div className="card text-amber-300" role="status">
            {statsError}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard
            label="Total Escrow Volume"
            value={reputationLoading ? 'Loading…' : formatXlm(totalVolume)}
          />
          <StatCard
            label="Average Escrow Size"
            value={
              reputationLoading || statsLoading
                ? 'Loading…'
                : averageVolume(totalVolume, totalEscrows)
            }
          />
        </div>

        {!statsError && (
          <div className="card space-y-4">
            {STATUS_ORDER.map((status) => {
              const count = statusCounts[status] ?? 0;
              const percentage = totalEscrows > 0 ? (count / totalEscrows) * 100 : 0;

              return (
                <div key={status}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-gray-300">{status}</span>
                    <span className="text-white font-semibold">{count}</span>
                  </div>
                  <div
                    className="h-3 rounded-full bg-gray-800 overflow-hidden"
                    role="img"
                    aria-label={`${status} escrows: ${count}`}
                  >
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-[width] duration-300"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="profile-history-heading">
        <div className="flex items-center justify-between gap-4">
          <h2 id="profile-history-heading" className="text-xl font-semibold text-white">
            History
          </h2>
          {historyMeta && (
            <span className="text-sm text-gray-500">
              Page {historyMeta.page} of {Math.max(1, historyMeta.totalPages)}
            </span>
          )}
        </div>

        {historyLoading && (
          <div className="card text-gray-400" role="status">
            Loading escrow history…
          </div>
        )}

        {historyError && (
          <div className="card text-amber-300" role="status">
            {historyError}
          </div>
        )}

        {!historyLoading && !historyError && history.length === 0 && (
          <div className="card text-gray-400">No history yet</div>
        )}

        {!historyLoading && !historyError && history.length > 0 && (
          <div className="space-y-3" role="list" aria-label="Escrow history">
            {/* Participant addresses are absent from this endpoint, so role is not displayed. */}
            {history.map((escrow) => (
              <Link
                key={String(escrow.id)}
                href={`/escrow/${escrow.id}`}
                className="card flex items-center justify-between gap-4 hover:border-indigo-500/40"
                role="listitem"
              >
                <div>
                  <p className="text-white font-semibold">Escrow #{String(escrow.id)}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {formatXlm(escrow.totalAmount)}
                  </p>
                </div>
                <Badge status={escrow.status} />
              </Link>
            ))}
          </div>
        )}

        {!historyError && historyMeta && historyMeta.totalPages > 1 && (
          <div className="flex justify-between gap-3">
            <Button
              variant="secondary"
              disabled={!historyMeta.hasPreviousPage}
              onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={!historyMeta.hasNextPage}
              onClick={() => setHistoryPage((page) => page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </section>

      <Modal
        isOpen={verificationOpen}
        onClose={() => setVerificationOpen(false)}
        title="Ownership verification"
        size="lg"
      >
        {verificationError && (
          <p className="text-red-400" role="alert">
            {verificationError}
          </p>
        )}

        {verification && (
          <div className="space-y-4">
            <p
              className={verification.verified ? 'text-emerald-400' : 'text-red-400'}
              role="status"
            >
              {verification.verified
                ? 'Signature verified successfully.'
                : 'Signature verification failed.'}
            </p>
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500">Public key</p>
              <p className="font-mono text-sm text-gray-300 break-all mt-1">
                {verification.publicKey}
              </p>
            </div>
            <div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-wider text-gray-500">Signature</p>
                <CopyButton text={verification.signature} label="Signature" />
              </div>
              <p className="font-mono text-sm text-gray-300 break-all mt-1">
                {verification.signature}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
