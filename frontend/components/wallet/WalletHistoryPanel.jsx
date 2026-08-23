'use client';

/**
 * WalletHistoryPanel
 *
 * Displays a wallet's full Stellar Horizon operation history, grouped by
 * escrow, labelled by operation type (Funded / Released / Refunded / Fee /
 * Unknown / Unrecognised), with cursor-based "Load more" pagination and a
 * CSV export of everything loaded so far.
 */

import { useMemo } from 'react';
import { useWalletHistory } from '../../hooks/useWalletHistory';
import { downloadWalletHistoryCsv } from '../../lib/walletHistoryCsv';
import TruncatedAddress from '../ui/TruncatedAddress';
import { Skeleton } from '../ui/Skeleton';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';

const NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet';

function stellarExpertOpUrl(opId) {
  const net = NETWORK === 'mainnet' ? 'public' : 'testnet';
  return `https://stellar.expert/explorer/${net}/op/${opId}`;
}

function OperationRow({ op }) {
  return (
    <tr role="row" className="border-t border-white/5">
      <td className="py-2 pr-4 text-sm">
        {op.createdAt ? new Date(op.createdAt).toLocaleString() : '—'}
      </td>
      <td className="py-2 pr-4">
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            op.label === 'Unrecognised' || op.label === 'Unknown'
              ? 'bg-gray-500/20 text-gray-400'
              : 'bg-emerald-500/20 text-emerald-400'
          }`}
        >
          {op.label}
        </span>
      </td>
      <td className="py-2 pr-4 text-sm" aria-label={op.amount ? `${op.amount} ${op.asset}` : 'no amount'}>
        {op.amount ? `${op.amount} ${op.asset}` : '—'}
      </td>
      <td className="py-2 pr-4 text-sm">
        {op.counterparty ? <TruncatedAddress address={op.counterparty} /> : '—'}
      </td>
      <td className="py-2 pr-4 text-sm">
        <a
          href={stellarExpertOpUrl(op.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
          style={{ color: 'var(--color-accent, #6ea8fe)' }}
        >
          View on Stellar Expert
        </a>
      </td>
    </tr>
  );
}

function OperationTable({ operations }) {
  return (
    <table className="w-full">
      <thead>
        <tr role="row" className="text-left text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <th className="py-2 pr-4">Date</th>
          <th className="py-2 pr-4">Type</th>
          <th className="py-2 pr-4">Amount</th>
          <th className="py-2 pr-4">Counterparty</th>
          <th className="py-2 pr-4">Explorer</th>
        </tr>
      </thead>
      <tbody>
        {operations.map((op) => (
          <OperationRow key={op.id} op={op} />
        ))}
      </tbody>
    </table>
  );
}

function GroupSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

export default function WalletHistoryPanel({ address }) {
  const { groups, other, loading, loadingMore, error, hasMore, loadMore, allOperations } =
    useWalletHistory(address);

  const isEmpty = useMemo(
    () => !loading && groups.length === 0 && other.length === 0,
    [loading, groups, other],
  );

  if (!address) return null;

  return (
    <section className="flex flex-col gap-6" aria-label="Wallet transaction history">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Transaction History</h2>
        <Button
          variant="secondary"
          disabled={allOperations.length === 0}
          onClick={() => downloadWalletHistoryCsv(allOperations)}
        >
          Download CSV
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-6">
          <GroupSkeleton />
          <GroupSkeleton />
        </div>
      ) : isEmpty ? (
        <EmptyState
          title="No transaction history yet"
          description="Once this wallet funds or receives from an escrow, activity will show up here."
        />
      ) : (
        <>
          {groups.map((group) => (
            <div key={group.escrowId} role="rowgroup">
              <h3 className="text-sm font-medium mb-2">Escrow #{group.escrowId}</h3>
              <div className="overflow-x-auto">
                <OperationTable operations={group.operations} />
              </div>
            </div>
          ))}

          {other.length > 0 && (
            <div role="rowgroup">
              <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>
                Other
              </h3>
              <div className="overflow-x-auto">
                <OperationTable operations={other} />
              </div>
            </div>
          )}

          {loadingMore && <GroupSkeleton />}

          {hasMore && !loadingMore && (
            <div className="flex justify-center">
              <Button variant="secondary" onClick={loadMore}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
