import Link from 'next/link';
import Badge from '../ui/Badge';
import CurrencyAmount from '../ui/CurrencyAmount';
import CopyButton from '../ui/CopyButton';
import EscrowCardSkeleton from '../ui/EscrowCardSkeleton';
import { useI18n } from '../../i18n/index.jsx';
import { useRef, useMemo } from 'react';
import { formatRemainingTime } from '../../lib/formatRemainingTime';

function deriveRoleAndCounterparty(escrow, userAddress) {
  if (escrow.role && escrow.counterparty) {
    return { role: escrow.role, counterparty: escrow.counterparty };
  }
  if (!userAddress || !escrow.clientAddress || !escrow.freelancerAddress) {
    return { role: null, counterparty: null };
  }
  const isClient = escrow.clientAddress === userAddress;
  return {
    role: isClient ? 'client' : 'freelancer',
    counterparty: isClient ? escrow.freelancerAddress : escrow.clientAddress,
  };
}

function isActionRequired(status, deadline) {
  if (status !== 'Active') return false;
  if (!deadline) return false;
  const now = Date.now();
  const deadlineMs = new Date(deadline).getTime();
  const msLeft = deadlineMs - now;
  return msLeft < 86400000;
}

export default function EscrowCard({ escrow, userAddress, isLoading = false }) {
  const { t } = useI18n();
  const cardRef = useRef(null);
  if (isLoading) return <EscrowCardSkeleton />;

  const { id, title, status, totalAmount, milestoneProgress, transactionHash, deadline } = escrow;
  const { role, counterparty } = useMemo(
    () => deriveRoleAndCounterparty(escrow, userAddress),
    [escrow, userAddress],
  );

  const [done, total] = milestoneProgress?.split(' / ').map(Number) ?? [0, 0];
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;
  const timeRemaining = formatRemainingTime(deadline);
  const needsAction = isActionRequired(status, deadline);

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      cardRef.current?.click();
    }
  };

  return (
    <Link
      href={`/escrow/${id}`}
      ref={cardRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={`card block transition-colors group focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-950 ${
        needsAction
          ? 'border-amber-500/50 hover:border-amber-400'
          : 'hover:border-gray-700'
      }`}
      role="button"
      aria-label={`View details for escrow: ${title}`}
    >
      {/* Header Row — ID, title, status badge */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-gray-500 shrink-0">#{id}</span>
            <h3 className="text-white font-semibold truncate group-hover:text-indigo-400 transition-colors">
              {title}
            </h3>
          </div>
          {counterparty && (
            <p className="text-xs text-gray-500 mt-0.5">
              {role === 'client' ? `${t('escrow.fields.freelancer')}:` : `${t('escrow.fields.client')}:`}{' '}
              <span className="font-mono text-gray-400">{counterparty}</span>
            </p>
          )}
        </div>
        <Badge status={status} size="sm" />
      </div>

      {/* Amount — converted to user's selected currency */}
      <CurrencyAmount amount={totalAmount} showUsdc size="md" className="mb-3" />

      {/* Deadline / Time Remaining */}
      {timeRemaining && (
        <div className="flex items-center gap-1.5 mb-3">
          <span className="text-xs text-gray-500">{t('escrow.fields.deadline')}:</span>
          <span
            className={`text-xs font-medium ${
              timeRemaining.includes('overdue')
                ? 'text-red-400'
                : needsAction
                  ? 'text-amber-400'
                  : 'text-gray-400'
            }`}
          >
            {timeRemaining}
          </span>
        </div>
      )}

      {/* Milestone Progress Bar */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{t('escrow.fields.milestones')}</span>
          <span>{milestoneProgress}</span>
        </div>
        <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden shadow-inner">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Transaction Hash */}
      {transactionHash && (
        <div className="mt-3 pt-3 border-t border-gray-800">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-500">TX:</span>
            <span className="text-xs font-mono text-gray-400 truncate">
              {transactionHash.slice(0, 16)}...
            </span>
            <div onClick={(e) => e.preventDefault()}>
              <CopyButton text={transactionHash} label="Copy" />
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-800">
        {role ? (
          <span
            className={`text-xs font-medium ${
              role === 'client' ? 'text-blue-400' : 'text-emerald-400'
            }`}
          >
            {role === 'client' ? t('escrow.fields.client') : t('escrow.fields.freelancer')}
          </span>
        ) : (
          <span />
        )}
        {needsAction && (
          <span className="text-xs font-medium text-amber-400 flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Action required
          </span>
        )}
      </div>
    </Link>
  );
}
