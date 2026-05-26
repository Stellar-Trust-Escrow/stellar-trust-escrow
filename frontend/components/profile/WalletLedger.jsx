'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useWallet } from '../../hooks/useWallet';
import {
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileText,
  CheckCircle,
  ArrowDownCircle,
  AlertTriangle,
  Award,
  Loader2,
} from 'lucide-react';

const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL || 'https://horizon-testnet.stellar.org';

const OPERATION_ICONS = {
  escrow_creation: FileText,
  milestone_approval: CheckCircle,
  deposit: ArrowDownCircle,
  dispute: AlertTriangle,
  reward: Award,
};

const OPERATION_COLORS = {
  escrow_creation: 'text-indigo-400 bg-indigo-500/10',
  milestone_approval: 'text-emerald-400 bg-emerald-500/10',
  deposit: 'text-blue-400 bg-blue-500/10',
  dispute: 'text-amber-400 bg-amber-500/10',
  reward: 'text-purple-400 bg-purple-500/10',
};

const OPERATION_LABELS = {
  escrow_creation: 'Escrow Creation',
  milestone_approval: 'Milestone Approval',
  deposit: 'Deposit',
  dispute: 'Dispute',
  reward: 'Reward',
};

function classifyOperation(op) {
  const type = op.type;
  if (type === 'create_account' || type === 'payment') return 'deposit';
  if (type === 'manage_data') {
    const name = (op.name || '').toLowerCase();
    if (name.includes('escrow')) return 'escrow_creation';
    if (name.includes('milestone') || name.includes('approve')) return 'milestone_approval';
    if (name.includes('dispute')) return 'dispute';
    if (name.includes('reward')) return 'reward';
  }
  return 'deposit';
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatTokenValue(op) {
  if (op.amount) {
    const num = parseFloat(op.amount);
    if (!isNaN(num)) {
      return `${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 7 })} XLM`;
    }
  }
  return '—';
}

function getStatus(op) {
  if (op.transaction_successful === true) return 'success';
  if (op.transaction_successful === false) return 'failed';
  return 'pending';
}

function getStatusIcon(status) {
  if (status === 'success') return CheckCircle;
  if (status === 'failed') return AlertTriangle;
  return Loader2;
}

function getStatusColor(status) {
  if (status === 'success') return 'text-emerald-400';
  if (status === 'failed') return 'text-red-400';
  return 'text-amber-400';
}

function getStatusLabel(status) {
  if (status === 'success') return 'Success';
  if (status === 'failed') return 'Failed';
  return 'Pending';
}

function stellarExpertLink(operationId) {
  const network = process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet';
  const base = network === 'mainnet'
    ? 'https://stellar.expert/explorer/public'
    : 'https://stellar.expert/explorer/testnet';
  return `${base}/operation/${operationId}`;
}

export default function WalletLedger() {
  const { address, isConnected } = useWallet();
  const [operations, setOperations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef(null);

  const fetchOperations = useCallback(async (pageCursor = null) => {
    if (!address) return;

    try {
      if (!pageCursor) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      setError(null);

      const params = new URLSearchParams({
        limit: '20',
        order: 'desc',
      });
      if (pageCursor) params.set('cursor', pageCursor);

      const res = await fetch(
        `${HORIZON_URL}/accounts/${address}/operations?${params}`,
      );
      if (!res.ok) throw new Error(`Horizon API error: ${res.status}`);

      const data = await res.json();

      const parsed = (data._embedded?.records || []).map((op) => ({
        id: op.id,
        type: classifyOperation(op),
        rawType: op.type,
        date: op.created_at,
        tokenValue: formatTokenValue(op),
        status: getStatus(op),
        blockNumber: op.transaction_hash ? op.transaction_hash.slice(0, 16) + '…' : '—',
        baseFee: op.transaction?.fee_charged
          ? `${(parseInt(op.transaction.fee_charged) / 1e7).toFixed(2)} XLM`
          : '—',
        transactionHash: op.transaction_hash,
        operationId: op.id,
        amount: op.amount,
        assetType: op.asset_type,
        from: op.from,
        to: op.to,
        name: op.name,
        value: op.value,
      }));

      setOperations((prev) =>
        pageCursor ? [...prev, ...parsed] : parsed,
      );

      if (data._embedded?.records.length < 20) {
        setHasMore(false);
      } else {
        const nextLink = data._links?.next?.href;
        if (nextLink) {
          const nextCursor = new URL(nextLink).searchParams.get('cursor');
          setCursor(nextCursor);
        } else {
          setHasMore(false);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [address]);

  useEffect(() => {
    if (isConnected && address) {
      setOperations([]);
      setCursor(null);
      setHasMore(true);
      fetchOperations(null);
    } else {
      setOperations([]);
    }
  }, [isConnected, address, fetchOperations]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    if (!sentinelRef.current || !hasMore || isLoadingMore || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !isLoading) {
          fetchOperations(cursor);
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [cursor, hasMore, isLoadingMore, isLoading, fetchOperations]);

  const toggleExpand = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  if (!isConnected) {
    return (
      <div
        className="text-center py-12 text-gray-500"
        role="region"
        aria-label="Wallet not connected"
      >
        <p>Connect your wallet to view transaction history.</p>
      </div>
    );
  }

  return (
    <div
      className="space-y-4"
      role="region"
      aria-label="Wallet Transaction Ledger"
    >
      <h2 className="text-lg font-semibold text-white">Transaction History</h2>

      {error && (
        <div
          className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-xl text-sm"
          role="alert"
        >
          {error}
        </div>
      )}

      {isLoading && operations.length === 0 && (
        <div className="flex justify-center py-12" role="status" aria-label="Loading transactions">
          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
        </div>
      )}

      {!isLoading && operations.length === 0 && !error && (
        <div className="text-center py-12 text-gray-500" role="status">
          <p>No transactions found for this wallet.</p>
        </div>
      )}

      <div className="space-y-2" role="list" aria-label="Transaction list">
        {operations.map((op, index) => {
          const Icon = OPERATION_ICONS[op.type] || FileText;
          const colorClass = OPERATION_COLORS[op.type] || 'text-gray-400 bg-gray-500/10';
          const StatusIcon = getStatusIcon(op.status);
          const statusColor = getStatusColor(op.status);
          const isExpanded = expandedId === op.id;

          return (
            <div
              key={op.id}
              role="listitem"
              aria-label={`Transaction ${index + 1}: ${OPERATION_LABELS[op.type] || op.rawType}`}
              className="group"
            >
              <button
                onClick={() => toggleExpand(op.id)}
                className="w-full text-left bg-gray-900/50 border border-gray-800 rounded-xl p-4 transition-all duration-200 hover:border-indigo-500/40 hover:shadow-[0_0_15px_rgba(99,102,241,0.15)] animate-fade-in focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                aria-expanded={isExpanded}
                aria-controls={`tx-detail-${op.id}`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}
                    aria-hidden="true"
                  >
                    <Icon className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white">
                        {OPERATION_LABELS[op.type] || op.rawType}
                      </span>
                      <span className={`flex items-center gap-1 text-xs ${statusColor}`}>
                        <StatusIcon className="w-3 h-3" aria-hidden="true" />
                        {getStatusLabel(op.status)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                      <span>{formatDate(op.date)}</span>
                      <span>{op.tokenValue}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <a
                      href={stellarExpertLink(op.operationId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-gray-500 hover:text-indigo-400 transition-colors p-1 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                      aria-label={`View on Stellar Expert for ${OPERATION_LABELS[op.type] || op.rawType}`}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <div className="text-gray-500" aria-hidden="true">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div
                  id={`tx-detail-${op.id}`}
                  role="region"
                  aria-label={`Details for ${OPERATION_LABELS[op.type] || op.rawType}`}
                  className="mx-4 mb-2 bg-gray-900/80 border border-gray-800 rounded-xl p-4 text-sm animate-fade-in"
                >
                  <dl className="grid grid-cols-2 gap-3">
                    <div>
                      <dt className="text-gray-500 text-xs">Block / Tx Hash</dt>
                      <dd className="text-gray-300 font-mono text-xs truncate">
                        {op.transactionHash || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 text-xs">Base Fee</dt>
                      <dd className="text-gray-300">{op.baseFee}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 text-xs">Date</dt>
                      <dd className="text-gray-300">{formatDate(op.date)}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 text-xs">Operation ID</dt>
                      <dd className="text-gray-300 font-mono text-xs truncate">{op.operationId}</dd>
                    </div>
                    {op.from && (
                      <div className="col-span-2">
                        <dt className="text-gray-500 text-xs">From</dt>
                        <dd className="text-gray-300 font-mono text-xs truncate">{op.from}</dd>
                      </div>
                    )}
                    {op.to && (
                      <div className="col-span-2">
                        <dt className="text-gray-500 text-xs">To</dt>
                        <dd className="text-gray-300 font-mono text-xs truncate">{op.to}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sentinel for infinite scroll */}
      {hasMore && (
        <div
          ref={sentinelRef}
          className="flex justify-center py-4"
          aria-label="Loading more transactions"
          role="status"
        >
          {isLoadingMore && (
            <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
          )}
        </div>
      )}

      {!hasMore && operations.length > 0 && (
        <p className="text-center text-gray-600 text-sm py-4">
          All transactions loaded.
        </p>
      )}
    </div>
  );
}
