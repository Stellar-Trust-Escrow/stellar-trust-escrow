/**
 * EscrowCard Component
 *
 * Summary card shown in list views (Dashboard, Explorer).
 * Links to the full Escrow Details page.
 *
 * @param {object} props
 * @param {object} props.escrow
 * @param {number}  props.escrow.id
 * @param {string}  props.escrow.title
 * @param {string}  props.escrow.status         — EscrowStatus
 * @param {string}  props.escrow.totalAmount
 * @param {string}  props.escrow.milestoneProgress  — e.g. "2 / 4"
 * @param {string}  props.escrow.counterparty    — truncated address
 * @param {'client'|'freelancer'} props.escrow.role
 *
 * TODO (contributor — easy, Issue #39):
 * - Add hover animation (subtle lift)
 * - Show milestone progress bar (filled segments)
 * - Show time remaining if deadline is set
 * - Add "disputed" warning banner if status === Disputed
 */

import Link from 'next/link';
import Badge from '../ui/Badge';
import CurrencyAmount from '../ui/CurrencyAmount';
import CopyButton from '../ui/CopyButton';
import { useI18n } from '../../i18n/index.jsx';

export default function EscrowCard({ escrow }) {
  const { t } = useI18n();
  const { id, title, status, totalAmount, milestoneProgress, counterparty, role, transactionHash } = escrow;

  const [done, total] = milestoneProgress?.split(' / ').map(Number) ?? [0, 0];
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <Link
      href={`/escrow/${id}`}
      className="card block hover:border-gray-700 transition-colors group"
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold truncate group-hover:text-indigo-400 transition-colors">
            {title}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {role === 'client' ? `${t('escrow.fields.freelancer')}:` : `${t('escrow.fields.client')}:`}{' '}
            <span className="font-mono">{counterparty}</span>
          </p>
        </div>
        <Badge status={status} size="sm" />
      </div>

      {/* Amount — converted to user's selected currency */}
      <CurrencyAmount amount={totalAmount} showUsdc size="md" className="mb-3" />

      {/* Milestone Progress Bar */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{t('escrow.fields.milestones')}</span>
          <span>{milestoneProgress}</span>
        </div>
        <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Transaction Hash */}
      {transactionHash && (
        <div className="mt-3 pt-3 border-t border-gray-800">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-500">TX:</span>
            <span className="text-xs font-mono text-gray-400 truncate">{transactionHash.slice(0, 16)}...</span>
            <div onClick={(e) => e.preventDefault()}>
              <CopyButton text={transactionHash} label="Copy" />
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-800">
        <span className="text-xs text-gray-600">#{id}</span>
        <span
          className={`text-xs font-medium ${
            role === 'client' ? 'text-blue-400' : 'text-emerald-400'
          }`}
        >
          You are {role === 'client' ? t('escrow.fields.client') : t('escrow.fields.freelancer')}
        </span>
      </div>
    </Link>
  );
}
