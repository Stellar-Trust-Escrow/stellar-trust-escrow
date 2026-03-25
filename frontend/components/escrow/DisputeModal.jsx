/**
 * DisputeModal Component
 *
 * Modal dialog for raising a dispute on an active escrow.
 * Explains the consequences and asks the user to confirm.
 *
 * @param {object}   props
 * @param {boolean}  props.isOpen
 * @param {Function} props.onClose
 * @param {number}   props.escrowId
 *
 * TODO (contributor — medium, Issue #41):
 * - Add reason textarea (stored off-chain / IPFS)
 * - Build and sign raise_dispute Soroban transaction
 * - Broadcast via POST /api/escrows/broadcast
 * - Show success state with tx hash
 * - Disable button while tx is pending
 * - Validate that the caller is client or freelancer of this escrow
 */

'use client';

import { useState } from 'react';
import Button from '../ui/Button';

export default function DisputeModal({ isOpen, onClose, escrowId }) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleRaise = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      // TODO (contributor — Issue #41):
      // 1. Build raise_dispute Soroban transaction
      // 2. Upload reason to IPFS, get hash
      // 3. Sign with Freighter
      // 4. Broadcast
      // 5. onClose() + show success toast
      throw new Error('Not implemented — see Issue #41');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-amber-500/30 rounded-2xl p-6 w-full max-w-md shadow-2xl">
          {/* Header */}
          <div className="flex items-start gap-3 mb-4">
            <span className="text-2xl">⚠️</span>
            <div>
              <h2 className="text-white font-bold text-lg">Raise Dispute</h2>
              <p className="text-gray-400 text-sm mt-0.5">Escrow #{escrowId}</p>
            </div>
          </div>

          {/* Warning */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-4 text-sm text-amber-300">
            Raising a dispute will <strong>freeze all funds</strong> in this escrow until the
            arbiter or contract admin resolves it. This action cannot be undone.
          </div>

          {/* Reason */}
          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-1">
              Reason for dispute <span className="text-gray-600">(recommended)</span>
            </label>
            <textarea
              rows={4}
              placeholder="Describe the issue clearly. This will be stored with the dispute record…"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5
                         text-white text-sm placeholder-gray-500 resize-none
                         focus:outline-none focus:border-amber-500"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            {/* TODO (contributor — Issue #41): show character count / IPFS upload status */}
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2.5 text-red-400 text-sm mb-4">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="secondary"
              className="flex-1 w-full"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              className="flex-1 w-full"
              onClick={handleRaise}
              disabled={isSubmitting}
              isLoading={isSubmitting}
            >
              {isSubmitting ? 'Signing…' : 'Confirm Dispute'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
