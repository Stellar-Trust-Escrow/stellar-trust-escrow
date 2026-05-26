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
import Modal from '../ui/Modal';

export default function DisputeModal({ isOpen, onClose, escrowId }) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Raise Dispute"
      isConfirmation={true}
      onConfirm={handleRaise}
      confirmLabel={isSubmitting ? 'Signing…' : 'Confirm Dispute'}
      confirmVariant="danger"
    >
      <div className="space-y-4">
        {/* Warning */}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-sm text-amber-300">
          Raising a dispute will <strong>freeze all funds</strong> in this escrow until the
          arbiter or contract admin resolves it. This action cannot be undone.
        </div>

        {/* Escrow ID */}
        <p className="text-gray-400 text-sm">Escrow #{escrowId}</p>

        {/* Reason */}
        <div>
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
            disabled={isSubmitting}
          />
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2.5 text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
