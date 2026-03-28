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
 * TODO (contributor — hard, Issue #34):
 * - Fetch escrow data: GET /api/escrows/:id
 * - Detect wallet role (client vs freelancer)
 * - Wire approve/reject/submit/dispute to contract interactions via Freighter
 * - Show real-time milestone status with SWR polling
 * - Handle loading and error states
 */

'use client';

import { useState } from 'react';
import MilestoneList from '../../../components/escrow/MilestoneList';
import DisputeModal from '../../../components/escrow/DisputeModal';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import ReputationBadge from '../../../components/ui/ReputationBadge';

// TODO (contributor): replace with SWR fetch
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

  // TODO (contributor — Issue #34):
  // const { data: escrow, isLoading, error } = useSWR(`/api/escrows/${id}`);
  const escrow = PLACEHOLDER_ESCROW;

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
            <Button variant="danger" size="sm" onClick={() => setDisputeOpen(true)}>
              ⚠ Raise Dispute
            </Button>
          )}
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <InfoCell label="Total" value={escrow.totalAmount} />
        <InfoCell label="Remaining" value={escrow.remainingBalance} />
        <InfoCell label="Created" value={escrow.createdAt} />
        <InfoCell label="Deadline" value={escrow.deadline || 'None'} />
      </div>

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
    </div>
  );
}

function InfoCell({ label, value }) {
  return (
    <div className="card py-3">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="text-white font-semibold mt-1">{value}</p>
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
