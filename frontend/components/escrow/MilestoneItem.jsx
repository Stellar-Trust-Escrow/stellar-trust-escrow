/**
 * MilestoneItem Component
 *
 * Renders a single milestone row with its status, amount,
 * and contextual action buttons based on the viewer's role.
 *
 * Action matrix:
 *  ┌──────────────┬─────────────────────────────────────────────┐
 *  │ Status       │ Client can         │ Freelancer can         │
 *  ├──────────────┼────────────────────┼────────────────────────┤
 *  │ Pending      │ —                  │ Submit Work            │
 *  │ Submitted    │ Approve / Reject   │ —                      │
 *  │ Approved     │ — (funds released) │ —                      │
 *  │ Rejected     │ —                  │ Submit Work (retry)    │
 *  └──────────────┴────────────────────┴────────────────────────┘
 *
 * @param {object}   props
 * @param {object}   props.milestone
 * @param {number}   props.index           — for display numbering
 * @param {'client'|'freelancer'|'observer'} props.role
 * @param {Function} props.onApprove(id)
 * @param {Function} props.onReject(id)
 * @param {Function} props.onSubmit(id)
 * @param {boolean}  props.isLast
 *
 * TODO (contributor — medium, Issue #40):
 * - Add confirmation modal before approve/reject
 * - Show tx hash link (Stellar Expert) after approval
 * - Add "View deliverable" link (IPFS hash)
 * - Handle loading state while tx is pending
 */

'use client';

import { useState } from 'react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import CurrencyAmount from '../ui/CurrencyAmount';
import { useI18n } from '../../i18n/index.jsx';
import { useToast } from '../../contexts/ToastContext';

export default function MilestoneItem({
  milestone,
  index,
  role,
  onApprove,
  onReject,
  onSubmit,
  isLast,
}) {
  const [isActing, setIsActing] = useState(false);
  const { t, formatDate } = useI18n();
  const { showToast } = useToast();

  const handleAction = async (actionFn, actionName) => {
    setIsActing(true);
    try {
      await actionFn(milestone.id);
      showToast(`${actionName} milestone successful!`, 'success');
    } catch (err) {
      showToast(`Failed to ${actionName.toLowerCase()} milestone`, 'error');
      console.error(`${actionName} failed:`, err.message);
    } finally {
      setIsActing(false);
    }
  };

  // Determine which status icon to show in the timeline dot
  const dotColor =
    milestone.status === 'Approved'
      ? 'bg-emerald-500'
      : milestone.status === 'Submitted'
        ? 'bg-blue-500'
        : milestone.status === 'Rejected'
          ? 'bg-red-500'
          : 'bg-gray-700';

  return (
    <div className="relative flex gap-4">
      {/* Timeline dot + connector */}
      <div className="flex flex-col items-center">
        <div
          className={`w-3 h-3 rounded-full flex-shrink-0 mt-1.5 ring-2 ring-gray-900 ${dotColor}`}
        />
        {!isLast && <div className="w-px flex-1 bg-gray-800 mt-1 min-h-[24px]" />}
      </div>

      {/* Content */}
      <div className="flex-1 pb-4">
        <div className="card space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600 font-mono">
                  #{String(index + 1).padStart(2, '0')}
                </span>
                <h4 className="text-white font-medium">{milestone.title}</h4>
              </div>
              {milestone.submittedAt && (
                <p className="text-xs text-gray-500 mt-0.5">{t('milestone.status.submitted')}: {formatDate(milestone.submittedAt)}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <CurrencyAmount amount={milestone.amount} size="sm" />
              <Badge status={milestone.status} size="sm" />
            </div>
          </div>

          {/* TODO (contributor — Issue #40): show description / IPFS link */}

          {/* Action Buttons */}
          {!isActing ? (
            <ActionButtons
              status={milestone.status}
              role={role}
              onApprove={() => handleAction(onApprove, 'approve')}
              onReject={() => handleAction(onReject, 'reject')}
              onSubmit={() => handleAction(onSubmit, 'submit')}
              t={t}
            />
          ) : (
            <p className="text-xs text-indigo-400 animate-pulse">{t('common.loading')}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Renders the correct set of action buttons based on role + status.
 */
function ActionButtons({ status, role, onApprove, onReject, onSubmit, t }) {
  if (role === 'client' && status === 'Submitted') {
    return (
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={onApprove}>
          ✓ {t('escrow.actions.approve')}
        </Button>
        <Button variant="danger" size="sm" onClick={onReject}>
          ✗ {t('escrow.actions.reject')}
        </Button>
      </div>
    );
  }

  if (role === 'freelancer' && (status === 'Pending' || status === 'Rejected')) {
    return (
      <Button variant="secondary" size="sm" onClick={onSubmit}>
        📤 {t('escrow.actions.submit')}
      </Button>
    );
  }

  if (status === 'Approved') {
    return <p className="text-xs text-emerald-400">✓ {t('escrow.actions.approve')}</p>;
  }

  return null;
}
