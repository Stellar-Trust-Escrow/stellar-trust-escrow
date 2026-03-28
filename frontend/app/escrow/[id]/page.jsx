/**
 * Escrow Details Page — /escrow/[id]
 *
 * Shows full escrow information, milestone timeline, and action buttons.
 *
 * Actions shown depend on the connected wallet's role:
 * - Client:     Approve / Reject milestone buttons
 * - Freelancer: Submit milestone button
 * - Both:       Raise Dispute button (if Active)
 *
 * Auto-refresh: data is polled every 30 seconds via SWR.
 * Polling pauses when the page tab is hidden and resumes on visibility.
 * A manual refresh button and last-updated timestamp are always shown.
 *
 * TODO (contributor — hard, Issue #34):
 * - Detect wallet role (client vs freelancer)
 * - Wire approve/reject/submit/dispute to contract interactions via Freighter
 * - Handle error states
 */

'use client';

import { useState, useEffect } from 'react';
import { useEscrow } from '../../../hooks/useEscrow';
import { useRelativeTime } from '../../../hooks/useRelativeTime';
import MilestoneList from '../../../components/escrow/MilestoneList';
import DisputeModal from '../../../components/escrow/DisputeModal';
import CancelEscrowModal from '../../../components/escrow/CancelEscrowModal';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import ReputationBadge from '../../../components/ui/ReputationBadge';
import CurrencyAmount from '../../../components/ui/CurrencyAmount';
import TransactionHash from '../../../components/ui/TransactionHash';

// Fallback data used while the API integration (Issue #34) is pending.
const PLACEHOLDER_ESCROW = {
  id: 1,
  title: 'Smart Contract Audit',
  status: 'Active',
  txHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', // TODO: replace with real tx hash
  clientAddress: 'GABCD...1234',
  freelancerAddress: 'GXYZ...5678',
  totalAmount: '2,000 USDC',
  remainingBalance: '1,500 USDC',
  createdAt: '2025-03-01',
  deadline: '2025-04-01',
  transactionHash: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2',
  milestones: [
    {
      id: 0,
      title: 'Codebase Review',
      amount: '500 USDC',
      status: 'Approved',
      submittedAt: '2025-03-05',
    },
    {
      id: 1,
      title: 'Vulnerability Report',
      amount: '1,000 USDC',
      status: 'Submitted',
      submittedAt: '2025-03-12',
    },
    {
      id: 2,
      title: 'Final Sign-off',
      amount: '500 USDC',
      status: 'Pending',
      submittedAt: null,
    },
  ],
};

export default function EscrowDetailPage({ params }) {
  const { id } = params;
  const [isDisputeOpen, setDisputeOpen] = useState(false);
  const [isCancelOpen, setCancelOpen] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { escrow: fetchedEscrow, isLoading, mutate } = useEscrow(id);
  const relativeTime = useRelativeTime(lastRefreshed);

  // Use fetched data when available, fall back to placeholder during development.
  const escrow = fetchedEscrow ?? PLACEHOLDER_ESCROW;

  // Update the last-refreshed timestamp whenever data arrives from SWR
  // (initial load, scheduled poll, or manual refresh).
  useEffect(() => {
    setLastRefreshed(new Date());
  }, [fetchedEscrow]);

  // Set an initial timestamp on mount so the UI is never empty.
  useEffect(() => {
    setLastRefreshed(new Date());
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await mutate();
      setLastRefreshed(new Date());
    } finally {
      setIsRefreshing(false);
    }
  };

  // TODO (contributor): derive from connected wallet address
  const connectedRole = 'client'; // "client" | "freelancer" | "observer"

  const handleApproveMilestone = async (milestoneId) => {
    // TODO (contributor — Issue #34):
    // 1. Build approve_milestone Soroban tx
    // 2. Sign with Freighter
    // 3. Broadcast
    // 4. Mutate SWR cache
    console.log('TODO: approve milestone', milestoneId);
  };

  const handleSubmitMilestone = async (milestoneId) => {
    // TODO (contributor — Issue #34)
    console.log('TODO: submit milestone', milestoneId);
  };

  const handleRejectMilestone = async (milestoneId) => {
    // TODO (contributor — Issue #34)
    console.log('TODO: reject milestone', milestoneId);
  };

  const handleCancelEscrow = async () => {
    // TODO (contributor — Issue #34):
    // 1. Build cancel_escrow Soroban tx
    // 2. Sign with Freighter
    // 3. Broadcast
    // 4. Redirect to dashboard
    console.log('TODO: cancel escrow', id);
  };

  if (isLoading && !fetchedEscrow) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-gray-400">
        Loading escrow…
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-white">{escrow.title}</h1>
            <Badge status={escrow.status} />
          </div>
          <p className="text-gray-400 text-sm">Escrow #{id}</p>
          <StellarExpertLink txHash={escrow.txHash} network={process.env.NEXT_PUBLIC_STELLAR_NETWORK} />
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {escrow.status === 'Active' && (
            <>
              <Button variant="danger" size="sm" onClick={() => setDisputeOpen(true)}>
                ⚠ Raise Dispute
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setCancelOpen(true)}>
                Cancel Escrow
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Refresh bar — last updated timestamp + manual refresh button */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span data-testid="last-refreshed" className="text-gray-500 text-sm">
          {relativeTime ? `Last updated: ${relativeTime}` : 'Loading…'}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          isLoading={isRefreshing}
          aria-label="Refresh escrow data"
        >
          ↻ Refresh
        </Button>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <InfoCell label="Total" value={escrow.totalAmount} isAmount />
        <InfoCell label="Remaining" value={escrow.remainingBalance} isAmount />
        <InfoCell label="Created" value={escrow.createdAt} />
        <InfoCell label="Deadline" value={escrow.deadline || 'None'} />
      </div>

      {/* Transaction Hash */}
      {escrow.transactionHash && (
        <div className="card">
          <TransactionHash
            hash={escrow.transactionHash}
            label="Transaction Hash"
            explorerUrl={`https://stellar.expert/explorer/testnet/tx/${escrow.transactionHash}`}
          />
        </div>
      )}

      {/* Parties */}
      <div className="card grid grid-cols-1 md:grid-cols-2 gap-6">
        <PartyCard
          role="Client"
          address={escrow.clientAddress}
          score={92}
          isYou={connectedRole === 'client'}
        />
        <PartyCard
          role="Freelancer"
          address={escrow.freelancerAddress}
          score={78}
          isYou={connectedRole === 'freelancer'}
        />
      </div>

      {/* Milestones */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">Milestones</h2>
        <MilestoneList
          milestones={escrow.milestones}
          role={connectedRole}
          onApprove={handleApproveMilestone}
          onReject={handleRejectMilestone}
          onSubmit={handleSubmitMilestone}
        />
      </section>

      {/* Dispute Modal */}
      <DisputeModal isOpen={isDisputeOpen} onClose={() => setDisputeOpen(false)} escrowId={id} />

      {/* Cancel Escrow Modal */}
      <CancelEscrowModal
        isOpen={isCancelOpen}
        onClose={() => setCancelOpen(false)}
        escrowId={id}
        onConfirm={handleCancelEscrow}
      />
    </div>
  );
}

function InfoCell({ label, value, isAmount = false }) {
  return (
    <div className="card py-3">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      {isAmount
        ? <CurrencyAmount amount={value} showUsdc size="md" className="mt-1" />
        : <p className="text-white font-semibold mt-1">{value}</p>
      }
    </div>
  );
}

function PartyCard({ role, address, score, isYou }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{role}</p>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-indigo-600/30 flex items-center justify-center text-indigo-400 font-bold text-sm">
          {address.slice(0, 2)}
        </div>
        <div>
          <p className="text-white text-sm font-mono">
            {address}
            {isYou && (
              <span className="ml-2 text-xs bg-indigo-600/20 text-indigo-400 px-1.5 py-0.5 rounded">
                You
              </span>
            )}
          </p>
          {/* TODO (contributor): link to /profile/[address] */}
        </div>
        <ReputationBadge score={score} size="sm" />
      </div>
    </div>
  );
}

function StellarExpertLink({ txHash, network }) {
  if (!txHash) return null;

  const isMainnet = network === 'mainnet';
  const baseUrl = isMainnet
    ? 'https://stellar.expert/explorer/public/tx'
    : 'https://stellar.expert/explorer/testnet/tx';

  return (
    <a
      href={`${baseUrl}/${txHash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors mt-1"
    >
      View on Stellar Expert
      {/* External link icon */}
      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </a>
  );
}
