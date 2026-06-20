'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useWallet } from '../../hooks/useWallet';
import { useToast } from '../../contexts/ToastContext';
import {
  ThumbsUp,
  ThumbsDown,
  Plus,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Send,
  Users,
  TrendingUp,
  Loader2,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const PROPOSAL_TYPES = {
  ParameterChange: 'Parameter Change',
  ContractUpgrade: 'Contract Upgrade',
  FundAllocation: 'Fund Allocation',
  TextProposal: 'Text Proposal',
};

const PROPOSAL_STATUS_ICONS = {
  Active: Clock,
  Passed: CheckCircle,
  Defeated: XCircle,
  Queued: AlertCircle,
  Executed: CheckCircle,
  Cancelled: XCircle,
};

const PROPOSAL_STATUS_COLORS = {
  Active: 'text-blue-400 bg-blue-500/10',
  Passed: 'text-emerald-400 bg-emerald-500/10',
  Defeated: 'text-red-400 bg-red-500/10',
  Queued: 'text-amber-400 bg-amber-500/10',
  Executed: 'text-emerald-400 bg-emerald-500/10',
  Cancelled: 'text-gray-400 bg-gray-500/10',
};

function CountdownTimer({ endTime, onTimeUp }) {
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = Math.max(0, endTime - now);
      setTimeLeft(remaining);

      if (remaining === 0) {
        clearInterval(interval);
        onTimeUp?.();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [endTime, onTimeUp]);

  if (timeLeft === null) return <span>Loading...</span>;

  const days = Math.floor(timeLeft / 86400);
  const hours = Math.floor((timeLeft % 86400) / 3600);
  const minutes = Math.floor((timeLeft % 3600) / 60);
  const seconds = timeLeft % 60;

  if (timeLeft === 0) return <span className="text-red-400 font-semibold">Voting Ended</span>;

  return (
    <span className="text-sm text-amber-400 font-semibold" role="timer">
      {days}d {hours}h {minutes}m {seconds}s remaining
    </span>
  );
}

function VotingResultBar({ voteCount, totalVotes, support }) {
  const percentage = totalVotes > 0 ? (voteCount / totalVotes) * 100 : 0;
  const color = support ? 'bg-emerald-500' : 'bg-red-500';

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center text-sm">
        <span className={support ? 'text-emerald-400' : 'text-red-400'}>
          {support ? 'For' : 'Against'}
        </span>
        <span className="text-gray-300">
          {voteCount} votes ({percentage.toFixed(1)}%)
        </span>
      </div>
      <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={Math.round(percentage)}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-label={`${support ? 'For' : 'Against'} votes: ${percentage.toFixed(1)}%`}
        />
      </div>
    </div>
  );
}

function ProposalCard({ proposal, onVote, onExpand, isExpanded, userVoting }) {
  const StatusIcon = PROPOSAL_STATUS_ICONS[proposal.status] || AlertCircle;
  const totalVotes = proposal.votes_for + proposal.votes_against;

  return (
    <div
      className="card hover:shadow-lg hover:shadow-blue-500/20 transition-all duration-300 animate-in fade-in slide-in-from-bottom-2"
      role="article"
      aria-label={`Proposal ${proposal.id}: ${proposal.title}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <StatusIcon
              size={20}
              className={PROPOSAL_STATUS_COLORS[proposal.status]}
              aria-hidden="true"
            />
            <h3 className="text-lg font-semibold text-white truncate">{proposal.title}</h3>
          </div>

          <p className="text-sm text-gray-400 mb-3 line-clamp-2">{proposal.description}</p>

          <div className="flex flex-wrap gap-2 mb-3 text-xs">
            <span className="px-2 py-1 rounded bg-gray-700 text-gray-300">
              {PROPOSAL_TYPES[proposal.proposal_type] || proposal.proposal_type}
            </span>
            <span className={`px-2 py-1 rounded ${PROPOSAL_STATUS_COLORS[proposal.status]}`}>
              {proposal.status}
            </span>
            {proposal.status === 'Active' && (
              <div className="px-2 py-1 rounded bg-blue-500/10 text-blue-400">
                <CountdownTimer
                  endTime={proposal.vote_end}
                  onTimeUp={() => window.location.reload()}
                />
              </div>
            )}
          </div>
        </div>

        <button
          onClick={() => onExpand(proposal.id)}
          className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
          aria-expanded={isExpanded}
        >
          {isExpanded ? (
            <ChevronUp size={20} className="text-gray-400" />
          ) : (
            <ChevronDown size={20} className="text-gray-400" />
          )}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-gray-700 space-y-4 animate-in fade-in slide-in-from-top-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Voting Stats</p>
              <div className="space-y-3">
                <VotingResultBar
                  voteCount={proposal.votes_for}
                  totalVotes={totalVotes}
                  support={true}
                />
                <VotingResultBar
                  voteCount={proposal.votes_against}
                  totalVotes={totalVotes}
                  support={false}
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-gray-400 uppercase tracking-wide">Details</p>
              <div className="text-sm space-y-1">
                <p>
                  <span className="text-gray-400">Proposer:</span>
                  <span className="text-gray-300 ml-2">{proposal.proposer.slice(0, 8)}...</span>
                </p>
                <p>
                  <span className="text-gray-400">Total Votes:</span>
                  <span className="text-gray-300 ml-2">{totalVotes}</span>
                </p>
                <p>
                  <span className="text-gray-400">Voting Share:</span>
                  <span className="text-blue-400 ml-2 font-semibold">
                    {proposal.user_voting_share || '0'}%
                  </span>
                </p>
              </div>
            </div>
          </div>

          {proposal.status === 'Active' && (
            <div className="pt-4 border-t border-gray-700 flex gap-2">
              <button
                onClick={() => onVote(proposal.id, true)}
                disabled={userVoting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 disabled:text-gray-400 text-white font-semibold rounded-lg transition-colors"
                aria-label={`Vote for proposal ${proposal.id}`}
              >
                {userVoting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <ThumbsUp size={16} />
                )}
                Vote For
              </button>
              <button
                onClick={() => onVote(proposal.id, false)}
                disabled={userVoting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-400 text-white font-semibold rounded-lg transition-colors"
                aria-label={`Vote against proposal ${proposal.id}`}
              >
                {userVoting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <ThumbsDown size={16} />
                )}
                Vote Against
              </button>
            </div>
          )}

          {proposal.voters && proposal.voters.length > 0 && (
            <div className="pt-4 border-t border-gray-700">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-2">
                <Users size={14} />
                Recent Voters
              </p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {proposal.voters.slice(0, 5).map((voter, idx) => (
                  <div
                    key={idx}
                    className="text-xs text-gray-300 flex items-center justify-between"
                  >
                    <span>{voter.address.slice(0, 10)}...</span>
                    <span className={voter.support ? 'text-emerald-400' : 'text-red-400'}>
                      {voter.support ? '✓ For' : '✗ Against'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProposalForm({ onSubmit, isSubmitting }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'TextProposal',
    paramKey: '',
    paramValue: '',
  });
  const [errors, setErrors] = useState({});

  const validateForm = () => {
    const newErrors = {};
    if (!formData.title.trim()) newErrors.title = 'Title required';
    if (!formData.description.trim()) newErrors.description = 'Description required';
    if (formData.type === 'ParameterChange') {
      if (!formData.paramKey.trim()) newErrors.paramKey = 'Parameter key required';
      if (!formData.paramValue.trim()) newErrors.paramValue = 'Parameter value required';
      if (isNaN(parseInt(formData.paramValue))) newErrors.paramValue = 'Must be a number';
    }
    return newErrors;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const newErrors = validateForm();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    onSubmit(formData);
    setFormData({ title: '', description: '', type: 'TextProposal', paramKey: '', paramValue: '' });
    setErrors({});
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="card space-y-4"
      role="form"
      aria-label="Create proposal"
    >
      <h2 className="text-2xl font-bold text-white flex items-center gap-2">
        <Plus size={24} className="text-blue-400" />
        Create Proposal
      </h2>

      <div>
        <label htmlFor="title" className="block text-sm font-semibold text-gray-300 mb-2">
          Title
        </label>
        <input
          id="title"
          type="text"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          className="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Proposal title"
          aria-invalid={!!errors.title}
          aria-describedby={errors.title ? 'title-error' : undefined}
        />
        {errors.title && (
          <p id="title-error" className="text-red-400 text-xs mt-1">
            {errors.title}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-semibold text-gray-300 mb-2">
          Description
        </label>
        <textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-vertical"
          placeholder="Proposal details"
          rows="3"
          aria-invalid={!!errors.description}
          aria-describedby={errors.description ? 'description-error' : undefined}
        />
        {errors.description && (
          <p id="description-error" className="text-red-400 text-xs mt-1">
            {errors.description}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="type" className="block text-sm font-semibold text-gray-300 mb-2">
          Proposal Type
        </label>
        <select
          id="type"
          value={formData.type}
          onChange={(e) => setFormData({ ...formData, type: e.target.value })}
          className="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {Object.entries(PROPOSAL_TYPES).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {formData.type === 'ParameterChange' && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="paramKey" className="block text-sm font-semibold text-gray-300 mb-2">
                Parameter Key
              </label>
              <input
                id="paramKey"
                type="text"
                value={formData.paramKey}
                onChange={(e) => setFormData({ ...formData, paramKey: e.target.value })}
                className="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. platform_fee"
                aria-invalid={!!errors.paramKey}
                aria-describedby={errors.paramKey ? 'paramKey-error' : undefined}
              />
              {errors.paramKey && (
                <p id="paramKey-error" className="text-red-400 text-xs mt-1">
                  {errors.paramKey}
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor="paramValue"
                className="block text-sm font-semibold text-gray-300 mb-2"
              >
                Value
              </label>
              <input
                id="paramValue"
                type="text"
                value={formData.paramValue}
                onChange={(e) => setFormData({ ...formData, paramValue: e.target.value })}
                className="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. 100"
                aria-invalid={!!errors.paramValue}
                aria-describedby={errors.paramValue ? 'paramValue-error' : undefined}
              />
              {errors.paramValue && (
                <p id="paramValue-error" className="text-red-400 text-xs mt-1">
                  {errors.paramValue}
                </p>
              )}
            </div>
          </div>
        </>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-400 text-white font-semibold rounded-lg transition-colors"
        aria-busy={isSubmitting}
      >
        {isSubmitting ? (
          <>
            <Loader2 size={20} className="animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            <Send size={20} />
            Submit Proposal
          </>
        )}
      </button>
    </form>
  );
}

export default function GovernancePage() {
  const { isConnected, address, signTx } = useWallet();
  const { showToast } = useToast();
  const [proposals, setProposals] = useState([]);
  const [userVotingShare, setUserVotingShare] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userVoting, setUserVoting] = useState(false);
  const [expandedProposal, setExpandedProposal] = useState(null);
  const [filter, setFilter] = useState('active');
  const liveRegionRef = useRef(null);

  const announceToScreenReader = (message) => {
    if (liveRegionRef.current) {
      liveRegionRef.current.textContent = message;
    }
  };

  useEffect(() => {
    const fetchProposals = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE}/api/governance/proposals`);
        if (response.ok) {
          const data = await response.json();
          setProposals(Array.isArray(data) ? data : data.proposals || []);
        }
      } catch (error) {
        console.error('Failed to fetch proposals:', error);
        showToast('Failed to load proposals', 'error');
      } finally {
        setLoading(false);
      }
    };

    const fetchUserVotingShare = async () => {
      if (isConnected && address) {
        try {
          const response = await fetch(`${API_BASE}/api/governance/voting-share/${address}`);
          if (response.ok) {
            const data = await response.json();
            setUserVotingShare(data.votingShare || 0);
          }
        } catch (error) {
          console.error('Failed to fetch voting share:', error);
        }
      }
    };

    fetchProposals();
    fetchUserVotingShare();
  }, [isConnected, address, showToast]);

  const handleVote = async (proposalId, support) => {
    if (!isConnected || !address) {
      showToast('Please connect your wallet', 'warning');
      return;
    }

    if (!signTx) {
      showToast('Wallet signing not available', 'error');
      return;
    }

    setUserVoting(true);
    try {
      const response = await fetch(`${API_BASE}/api/governance/proposals/${proposalId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voter: address, support }),
      });

      if (response.ok) {
        setProposals((prev) =>
          prev.map((p) =>
            p.id === proposalId
              ? {
                  ...p,
                  votes_for: support ? p.votes_for + 1 : p.votes_for,
                  votes_against: !support ? p.votes_against + 1 : p.votes_against,
                }
              : p,
          ),
        );
        const action = support ? 'for' : 'against';
        showToast(`Vote cast ${action} proposal`, 'success');
        announceToScreenReader(`Your vote ${action} proposal ${proposalId} has been recorded`);
      } else {
        showToast('Failed to cast vote', 'error');
      }
    } catch (error) {
      console.error('Vote error:', error);
      showToast('Error casting vote', 'error');
    } finally {
      setUserVoting(false);
    }
  };

  const handleCreateProposal = async (formData) => {
    if (!isConnected || !address) {
      showToast('Please connect your wallet', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        proposer: address,
        title: formData.title,
        description: formData.description,
        proposalType: formData.type,
        ...(formData.type === 'ParameterChange' && {
          paramKey: formData.paramKey,
          paramValue: parseInt(formData.paramValue),
        }),
      };

      const response = await fetch(`${API_BASE}/api/governance/proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const newProposal = await response.json();
        setProposals((prev) => [newProposal, ...prev]);
        showToast('Proposal created successfully', 'success');
        announceToScreenReader('New proposal created successfully');
      } else {
        showToast('Failed to create proposal', 'error');
      }
    } catch (error) {
      console.error('Proposal creation error:', error);
      showToast('Error creating proposal', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredProposals = proposals.filter((p) => {
    if (filter === 'active') return p.status === 'Active';
    if (filter === 'resolved') return ['Executed', 'Defeated', 'Cancelled'].includes(p.status);
    return true;
  });

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="card text-center py-12">
            <AlertCircle size={48} className="mx-auto mb-4 text-amber-400" />
            <h2 className="text-2xl font-bold text-white mb-2">Connect Your Wallet</h2>
            <p className="text-gray-400 mb-6">
              Please connect your wallet to access governance features
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 px-4 py-8">
      <div
        ref={liveRegionRef}
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      />

      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
              <TrendingUp size={32} className="text-blue-400" />
              Governance Portal
            </h1>
            <p className="text-gray-400">
              Your voting share:{' '}
              <span className="text-blue-400 font-semibold">{userVotingShare}%</span>
            </p>
          </div>

          <div className="flex gap-2 bg-gray-800 rounded-lg p-1">
            {['active', 'resolved', 'all'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded font-semibold capitalize transition-colors ${
                  filter === f ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
                aria-pressed={filter === f}
              >
                {f === 'all' ? 'All Proposals' : f === 'active' ? 'Active' : 'Resolved'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {loading ? (
              <div className="card flex items-center justify-center py-12">
                <Loader2 size={32} className="animate-spin text-blue-400" />
              </div>
            ) : filteredProposals.length === 0 ? (
              <div className="card text-center py-12">
                <p className="text-gray-400">No {filter} proposals</p>
              </div>
            ) : (
              filteredProposals.map((proposal) => (
                <ProposalCard
                  key={proposal.id}
                  proposal={proposal}
                  onVote={handleVote}
                  onExpand={setExpandedProposal}
                  isExpanded={expandedProposal === proposal.id}
                  userVoting={userVoting}
                />
              ))
            )}
          </div>

          <div className="lg:col-span-1">
            <ProposalForm onSubmit={handleCreateProposal} isSubmitting={isSubmitting} />
          </div>
        </div>
      </div>
    </div>
  );
}
