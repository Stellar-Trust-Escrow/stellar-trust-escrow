/**
 * CancelEscrowModal Component
 *
 * Modal dialog for canceling an escrow agreement.
 * Requires confirmation due to irreversible nature.
 *
 * @param {object}   props
 * @param {boolean}  props.isOpen
 * @param {Function} props.onClose
 * @param {number}   props.escrowId
 * @param {Function} props.onConfirm
 */

'use client';

import { useState } from 'react';
import Modal from '../ui/Modal';

export default function CancelEscrowModal({ isOpen, onClose, escrowId, onConfirm }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleCancel = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
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
      title="Cancel Escrow"
      isConfirmation={true}
      onConfirm={handleCancel}
      confirmLabel={isSubmitting ? 'Canceling…' : 'Cancel Escrow'}
      confirmVariant="danger"
    >
      <div className="space-y-4">
        {/* Warning */}
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-300">
          Canceling this escrow will <strong>return all funds</strong> to the client. This action
          cannot be undone and requires mutual agreement.
        </div>

        {/* Escrow ID */}
        <p className="text-gray-400 text-sm">Escrow #{escrowId}</p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2.5 text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
