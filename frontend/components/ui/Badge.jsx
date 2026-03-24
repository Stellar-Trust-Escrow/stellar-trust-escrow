/**
 * Badge Component
 *
 * Displays a colored status pill for EscrowStatus and milestone states.
 *
 * @param {object} props
 * @param {string} props.status — EscrowStatus or MilestoneStatus value
 * @param {'sm'|'md'} [props.size='md']
 *
 * TODO (contributor — easy, Issue #31):
 * Ensure all EscrowStatus and MilestoneStatus values are covered:
 * Escrow:    Active, Completed, Disputed, Cancelled
 * Milestone: Pending, Submitted, Approved, Rejected
 * Reputation: NEW, TRUSTED, VERIFIED, EXPERT, ELITE
 */

const STATUS_STYLES = {
  // Escrow statuses
  Active: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  Completed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  Disputed: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',

  // Milestone statuses
  Pending: 'bg-gray-700/50 text-gray-400 border-gray-600/30',
  Submitted: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Approved: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  Rejected: 'bg-red-500/20 text-red-400 border-red-500/30',

  // Reputation badges
  NEW: 'bg-gray-700/50 text-gray-400 border-gray-600/30',
  TRUSTED: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  VERIFIED: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  EXPERT: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  ELITE: 'bg-amber-500/20 text-amber-400 border-amber-500/30',

  // KYC statuses
  Init: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Processing: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Approved: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  Declined: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const ICONS = {
  Active: '🔒',
  Completed: '✅',
  Disputed: '⚠️',
  Cancelled: '✕',
  Pending: '○',
  Submitted: '📤',
  Approved: '✓',
  Rejected: '✗',
  TRUSTED: '🔵',
  VERIFIED: '💜',
  EXPERT: '⭐',
  ELITE: '🏆',
  // KYC
  Init: '🔄',
  Processing: '⏳',
  Approved: '✅',
  Declined: '❌',
};

export default function Badge({ status, size = 'md' }) {
  const styles = STATUS_STYLES[status] || 'bg-gray-700 text-gray-400 border-gray-600';
  const icon = ICONS[status] || '';
  const sizeClass = size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-xs px-2 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1 font-medium border rounded-full ${sizeClass} ${styles}`}
    >
      {icon && <span className="text-[10px]">{icon}</span>}
      {status}
    </span>
  );
}
