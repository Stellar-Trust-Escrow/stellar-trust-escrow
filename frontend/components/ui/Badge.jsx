/**
 * Badge Component
 *
 * Displays a colored status pill for EscrowStatus and milestone states.
 *
 * @param {object} props
 * @param {string} [props.status] — EscrowStatus or MilestoneStatus value
 * @param {string} [props.variant] — alias for status (e.g. 'success' maps to green)
 * @param {'sm'|'md'} [props.size='md']
 * @param {React.ReactNode} [props.children] — label override (used when variant is passed)
 */

// Escrow status colors per acceptance criteria:
//   Active → green, Completed → blue, Disputed → red, Cancelled → gray
const STATUS_STYLES = {
  // Escrow statuses
  Active: 'bg-green-500/20 text-green-400 border-green-500/30',
  Completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Disputed: 'bg-red-500/20 text-red-400 border-red-500/30',
  Cancelled: 'bg-gray-700/50 text-gray-400 border-gray-600/30',

  // Milestone statuses
  Pending: 'bg-gray-700/50 text-gray-400 border-gray-600/30',
  Submitted: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Approved: 'bg-green-500/20 text-green-400 border-green-500/30',
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
  Declined: 'bg-red-500/20 text-red-400 border-red-500/30',

  // Generic variants (used by accessibility tests and generic callers)
  success: 'bg-green-500/20 text-green-400 border-green-500/30',
  warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  danger: 'bg-red-500/20 text-red-400 border-red-500/30',
  info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  default: 'bg-gray-700/50 text-gray-400 border-gray-600/30',
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
  Init: '🔄',
  Processing: '⏳',
  Declined: '❌',
};

export default function Badge({ status, variant, size = 'md', children }) {
  const key = status || variant;
  const styles = STATUS_STYLES[key] || 'bg-gray-700 text-gray-400 border-gray-600';
  const icon = ICONS[key] || '';
  const sizeClass = size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-xs px-2 py-1';
  const label = children ?? key;

  return (
    <span
      role="status"
      aria-label={`Status: ${label}`}
      className={`inline-flex items-center gap-1 font-medium border rounded-full ${sizeClass} ${styles}`}
    >
      {icon && <span aria-hidden="true" className="text-[10px]">{icon}</span>}
      {label}
    </span>
  );
}
