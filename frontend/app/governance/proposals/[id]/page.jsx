'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { ThumbsUp, ThumbsDown, MessageCircle, Clock } from 'lucide-react';
import Button from '../../../../components/ui/Button';
import { useI18n } from '../../../../i18n/index.jsx';

const COLORS = ['#10b981', '#ef4444', '#f59e0b'];

export default function ProposalPage({ params }) {
  const { t } = useI18n();
  const [proposal, setProposal] = useState(null);
  const [votes, setVotes] = useState({ yes: 0, no: 0, abstain: 0 });
  const [timeRemaining, setTimeRemaining] = useState('');
  const [walletBalance, setWalletBalance] = useState('0');
  const [simulatedVote, setSimulatedVote] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const mockProposal = {
      id: params.id,
      title: 'Increase Protocol Fee to 2%',
      description: 'This proposal aims to increase the protocol fee from 1% to 2% to fund ecosystem development.',
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      totalVotingPower: 1000000,
      quorumRequired: 400000,
      status: 'active',
    };
    setProposal(mockProposal);
    setWalletBalance('50000');

    const mockComments = [
      {
        id: 1,
        author: 'Alice',
        content: 'I support this proposal. The protocol needs more funding.',
        timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000),
        votes: 24,
        replies: [
          {
            id: 11,
            author: 'Bob',
            content: 'I agree with Alice.',
            timestamp: new Date(Date.now() - 30 * 60 * 1000),
            votes: 8,
          },
        ],
      },
      {
        id: 2,
        author: 'Charlie',
        content: 'I have concerns about the fee increase impact on smaller transactions.',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
        votes: 12,
        replies: [],
      },
    ];
    setComments(mockComments);

    setVotes({
      yes: 450000,
      no: 150000,
      abstain: 50000,
    });

    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    if (!proposal) return;

    const updateCountdown = () => {
      const now = new Date();
      const diff = proposal.endsAt - now;

      if (diff <= 0) {
        setTimeRemaining('Voting closed');
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      setTimeRemaining(`${days}d ${hours}h ${minutes}m`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000);
    return () => clearInterval(interval);
  }, [proposal]);

  const totalVotes = votes.yes + votes.no + votes.abstain;
  const quorumPercent = (totalVotes / proposal?.quorumRequired || 0) * 100;
  const yesPercent = totalVotes > 0 ? (votes.yes / totalVotes) * 100 : 0;

  const voteDistribution = [
    { name: 'Yes', value: votes.yes },
    { name: 'No', value: votes.no },
    { name: 'Abstain', value: votes.abstain },
  ];

  const handleVoteSimulation = (voteType) => {
    const impactValue = (parseInt(walletBalance) / proposal?.totalVotingPower) * 100;
    setSimulatedVote({
      type: voteType,
      impact: impactValue.toFixed(4),
    });
  };

  const handleCommentSubmit = () => {
    if (!newComment.trim()) return;
    const comment = {
      id: comments.length + 1,
      author: 'You',
      content: newComment,
      timestamp: new Date(),
      votes: 0,
      replies: [],
    };
    setComments([comment, ...comments]);
    setNewComment('');
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="card animate-pulse h-40" />
        <div className="card animate-pulse h-60" />
      </div>
    );
  }

  if (!proposal) {
    return <div className="card text-center py-8 text-gray-400">Proposal not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-white mb-2">{proposal.title}</h1>
            <p className="text-gray-400">{proposal.description}</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500 mb-1">Time Remaining</div>
            <div className="flex items-center gap-2 text-lg font-mono text-indigo-400">
              <Clock size={18} />
              <span aria-live="polite" aria-atomic="true">
                {timeRemaining}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Quorum Progress Bar */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white">Quorum Progress</h2>
          <span className="text-sm text-gray-400">
            <span aria-live="polite">{totalVotes.toLocaleString()}</span> /{' '}
            {proposal.quorumRequired.toLocaleString()} votes
          </span>
        </div>
        <div
          className="w-full bg-gray-800 rounded-full h-3 overflow-hidden"
          role="progressbar"
          aria-valuenow={quorumPercent}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-label="Quorum progress"
        >
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-500"
            style={{ width: `${Math.min(quorumPercent, 100)}%` }}
          />
        </div>
        <div className="text-sm text-gray-400">
          {quorumPercent.toFixed(1)}% of quorum required{' '}
          <span aria-live="polite" aria-atomic="true">
            {quorumPercent >= 100 ? '✓ Quorum reached!' : ''}
          </span>
        </div>
      </div>

      {/* Vote Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-white">Vote Distribution</h2>
          <div role="region" aria-label="Vote distribution pie chart">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={voteDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {voteDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Vote Simulator */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-white">Your Voting Power</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-400 mb-1">Connected Wallet Balance</p>
              <p className="text-2xl font-bold text-indigo-400">
                {parseInt(walletBalance).toLocaleString()} tokens
              </p>
            </div>

            <div className="bg-gray-800/50 rounded-lg p-3 text-sm">
              <p className="text-gray-400 mb-2">Your vote impact:</p>
              {simulatedVote ? (
                <div aria-live="polite" aria-atomic="true">
                  <p className="text-white font-mono">
                    {simulatedVote.impact}% of total votes
                  </p>
                  <p className="text-gray-500 text-xs mt-1">
                    Voting {simulatedVote.type.toUpperCase()}
                  </p>
                </div>
              ) : (
                <p className="text-gray-500">Select a voting option to see impact</p>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleVoteSimulation('yes')}
                className="flex-1 flex items-center justify-center gap-2"
              >
                <ThumbsUp size={16} /> Yes
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleVoteSimulation('no')}
                className="flex-1 flex items-center justify-center gap-2"
              >
                <ThumbsDown size={16} /> No
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Comment Board */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-white flex items-center gap-2">
          <MessageCircle size={18} />
          Discussion ({comments.length})
        </h2>

        {/* New Comment */}
        <div className="space-y-2">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Share your thoughts... (Markdown supported)"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            rows="3"
          />
          <Button
            variant="primary"
            size="sm"
            onClick={handleCommentSubmit}
            disabled={!newComment.trim()}
          >
            Post Comment
          </Button>
        </div>

        {/* Comments List */}
        <div className="space-y-4 pt-4 border-t border-gray-800">
          {comments.map((comment) => (
            <div key={comment.id} className="space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-white">{comment.author}</p>
                  <p className="text-xs text-gray-500">
                    {comment.timestamp.toLocaleDateString()} {comment.timestamp.toLocaleTimeString()}
                  </p>
                </div>
                <div className="text-sm text-gray-400">👍 {comment.votes}</div>
              </div>
              <p className="text-gray-300 text-sm">{comment.content}</p>

              {/* Nested Replies */}
              {comment.replies?.length > 0 && (
                <div className="ml-4 mt-3 space-y-3 border-l-2 border-gray-800 pl-4">
                  {comment.replies.map((reply) => (
                    <div key={reply.id} className="space-y-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-gray-300 text-sm">{reply.author}</p>
                          <p className="text-xs text-gray-600">
                            {reply.timestamp.toLocaleTimeString()}
                          </p>
                        </div>
                        <div className="text-xs text-gray-600">👍 {reply.votes}</div>
                      </div>
                      <p className="text-gray-400 text-sm">{reply.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
