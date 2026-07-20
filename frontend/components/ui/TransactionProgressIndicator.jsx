'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const STEPS = [
  { id: 'signing', label: 'Awaiting Signature', icon: '✍️' },
  { id: 'broadcast', label: 'Broadcasting', icon: '📡' },
  { id: 'confirming', label: 'Confirming', icon: '⏳' },
  { id: 'confirmed', label: 'Confirmed', icon: '✅' },
];

export default function TransactionProgressIndicator({
  isOpen,
  currentStep,
  transactionHash,
  error,
  onClose,
  network = 'testnet',
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !isOpen) return null;

  const stepIndex = STEPS.findIndex((s) => s.id === currentStep);
  const explorerUrl = `https://stellar.expert/explorer/${network}/tx/${transactionHash}`;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full mx-4">
        {/* Header */}
        <h2 className="text-xl font-bold text-gray-900 mb-6">
          {error ? 'Transaction Error' : 'Processing Transaction'}
        </h2>

        {/* Step Progress */}
        {!error && (
          <div className="space-y-4 mb-8">
            {STEPS.map((step, idx) => (
              <div
                key={step.id}
                className="flex items-center gap-3"
                data-testid={`step-${step.id}`}
              >
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                    idx < stepIndex
                      ? 'bg-green-500 text-white'
                      : idx === stepIndex
                        ? 'bg-indigo-600 text-white animate-pulse'
                        : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {idx < stepIndex ? '✓' : step.icon}
                </div>
                <span
                  className={`text-sm font-medium ${
                    idx <= stepIndex ? 'text-gray-900' : 'text-gray-400'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Hash Display */}
        {transactionHash && !error && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600 mb-2">Transaction Hash</p>
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-mono text-indigo-600 hover:text-indigo-700 break-all"
              data-testid="tx-hash-link"
            >
              {transactionHash.slice(0, 20)}...
            </a>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 rounded-lg">
            <p className="text-sm text-red-700 font-medium mb-2">Error occurred</p>
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Action Buttons */}
        {error && (
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors focus-visible:ring-2 focus-visible:ring-indigo-400"
            data-testid="close-button"
          >
            Close
          </button>
        )}

        {!error && stepIndex >= 3 && (
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors"
            data-testid="success-button"
          >
            Done
          </button>
        )}

        {!error && stepIndex < 3 && (
          <p className="text-xs text-gray-500 text-center">
            Please wait, this may take up to 30 seconds...
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
