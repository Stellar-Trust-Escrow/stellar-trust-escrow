'use client';
import { useState } from 'react';
import { CopyButton } from '../ui/CopyButton';

interface TransferLog {
  id: string;
  fromOwner: string;
  toOwner: string;
  txHash: string;
  createdAt: string;
}

interface OwnershipData {
  currentOwner: string | null;
  pendingTransfer: string | null;
  transferLog: TransferLog[];
}

interface Props {
  escrowId: string;
  data: OwnershipData;
  currentUserAddress?: string;
  onOfferTransfer: (newOwner: string) => Promise<void>;
  onAcceptTransfer: () => Promise<void>;
  onCancelTransfer: () => Promise<void>;
}

function truncate(addr: string) {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function OwnershipPanel({
  escrowId,
  data,
  currentUserAddress,
  onOfferTransfer,
  onAcceptTransfer,
  onCancelTransfer,
}: Props) {
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [newOwnerInput, setNewOwnerInput] = useState('');
  const [busy, setBusy] = useState(false);

  const isOwner = currentUserAddress && data.currentOwner === currentUserAddress;
  const isPendingRecipient = currentUserAddress && data.pendingTransfer === currentUserAddress;

  async function handleOffer() {
    if (!newOwnerInput.trim()) return;
    setBusy(true);
    try {
      await onOfferTransfer(newOwnerInput.trim());
      setShowTransferModal(false);
      setNewOwnerInput('');
    } finally {
      setBusy(false);
    }
  }

  async function handleAccept() {
    setBusy(true);
    try {
      await onAcceptTransfer();
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    setBusy(true);
    try {
      await onCancelTransfer();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Client Rights</h3>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-500 dark:text-gray-400">Owner:</span>
        {data.currentOwner ? (
          <>
            <span
              title={data.currentOwner}
              className="font-mono text-gray-800 dark:text-gray-200"
            >
              {truncate(data.currentOwner)}
            </span>
            <CopyButton text={data.currentOwner} value={data.currentOwner} label="address" />
          </>
        ) : (
          <span className="text-gray-400 italic">Not registered</span>
        )}
      </div>

      {data.pendingTransfer && (
        <div className="rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 px-3 py-2 text-xs space-y-1">
          <p className="text-yellow-800 dark:text-yellow-200">
            Transfer pending — waiting for{' '}
            <span className="font-mono" title={data.pendingTransfer}>
              {truncate(data.pendingTransfer)}
            </span>
          </p>
          {isPendingRecipient && (
            <button
              onClick={handleAccept}
              disabled={busy}
              className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
            >
              Accept transfer
            </button>
          )}
          {isOwner && (
            <button
              onClick={handleCancel}
              disabled={busy}
              className="text-xs px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 disabled:opacity-50 ml-2"
            >
              Cancel
            </button>
          )}
        </div>
      )}

      {isOwner && !data.pendingTransfer && (
        <button
          onClick={() => setShowTransferModal(true)}
          className="text-xs px-3 py-1 rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
        >
          Transfer rights
        </button>
      )}

      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 w-full max-w-md space-y-4">
            <h4 className="font-semibold text-gray-800 dark:text-gray-200">Transfer client rights</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Enter the Stellar address that will receive ownership of escrow {escrowId}.
            </p>
            <input
              type="text"
              value={newOwnerInput}
              onChange={(e) => setNewOwnerInput(e.target.value)}
              placeholder="G..."
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowTransferModal(false); setNewOwnerInput(''); }}
                className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleOffer}
                disabled={busy || !newOwnerInput.trim()}
                className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? 'Sending…' : 'Offer transfer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {data.transferLog.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            Transfer history ({data.transferLog.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {data.transferLog.map((entry) => (
              <li key={entry.id} className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                <span className="font-mono" title={entry.fromOwner}>{truncate(entry.fromOwner)}</span>
                <span>→</span>
                <span className="font-mono" title={entry.toOwner}>{truncate(entry.toOwner)}</span>
                <span className="text-gray-400 ml-1">{new Date(entry.createdAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export default OwnershipPanel;
