'use client';

import React, { useEffect, useRef } from 'react';
import { cn } from '../../lib/utils';

export type WalletConnectStatus = 'disconnected' | 'connecting' | 'connected';
export type WalletKind = 'freighter' | 'ledger';

export interface WalletConnectModalProps {
  /** Whether the modal is visible. */
  open: boolean;
  /** Connection lifecycle state, drives which panel is shown. */
  status: WalletConnectStatus;
  /** Which wallet integration is being used / was used. */
  walletType?: WalletKind;
  /** Connected public key (when `status === 'connected'`). */
  address?: string | null;
  /** Human readable error message. */
  error?: string | null;
  /**
   * 0-based index of the active step when `walletType === 'ledger'`.
   * Used by the "LedgerStep" variant to highlight progress.
   */
  ledgerStep?: number;
  /** Invoked when the user picks a wallet to connect. */
  onConnect?: (kind: WalletKind) => void;
  /** Invoked when the user disconnects an established session. */
  onDisconnect?: () => void;
  /** Invoked when the modal is dismissed. */
  onClose?: () => void;
  className?: string;
}

const LEDGER_STEPS = [
  'Open the Stellar app on your Ledger',
  'Keep the device connected via USB',
  'Approve the connection request on your Ledger',
];

function Spinner({ className: c }: { className?: string }) {
  return (
    <svg className={cn('animate-spin', c)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

/**
 * WalletConnectModal — modal that guides a user through connecting a Stellar
 * wallet (Freighter or Ledger) and shows the connected state.
 *
 * Variants surfaced as stories: `Disconnected`, `Connecting`,
 * `ConnectedFreighter`, `LedgerStep`.
 */
export default function WalletConnectModal({
  open,
  status,
  walletType = 'freighter',
  address,
  error,
  ledgerStep = 0,
  onConnect,
  onDisconnect,
  onClose,
  className,
}: WalletConnectModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) primaryRef.current?.focus();
  }, [open, status]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const titleId = 'wallet-connect-title';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        ref={dialogRef}
        className={cn(
          'w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl',
          className,
        )}
      >
        <div className="flex items-start justify-between">
          <h2 id={titleId} className="text-lg font-semibold text-gray-100">
            {status === 'connected'
              ? 'Wallet connected'
              : status === 'connecting'
                ? `Connecting to ${walletType === 'ledger' ? 'Ledger' : 'Freighter'}…`
                : 'Connect a wallet'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close wallet connection dialog"
            className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            ✕
          </button>
        </div>

        {/* Disconnected — choose a wallet */}
        {status === 'disconnected' && (
          <div className="mt-5 grid gap-3">
            <button
              ref={primaryRef}
              type="button"
              onClick={() => onConnect?.('freighter')}
              className="flex items-center justify-between rounded-xl border border-gray-700 bg-gray-800/50 px-4 py-3 text-left transition-colors hover:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <span>
                <span className="block text-sm font-medium text-gray-100">Freighter</span>
                <span className="block text-xs text-gray-400">Browser extension wallet</span>
              </span>
              <span className="text-xs text-indigo-400">Connect →</span>
            </button>
            <button
              type="button"
              onClick={() => onConnect?.('ledger')}
              className="flex items-center justify-between rounded-xl border border-gray-700 bg-gray-800/50 px-4 py-3 text-left transition-colors hover:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <span>
                <span className="block text-sm font-medium text-gray-100">Ledger</span>
                <span className="block text-xs text-gray-400">Hardware wallet</span>
              </span>
              <span className="text-xs text-indigo-400">Connect →</span>
            </button>
            {error && (
              <p role="alert" className="text-xs text-red-400">
                {error}
              </p>
            )}
          </div>
        )}

        {/* Connecting — spinner / ledger steps */}
        {status === 'connecting' && (
          <div className="mt-5">
            {walletType === 'ledger' ? (
              <ol className="space-y-3" aria-label="Ledger connection steps">
                {LEDGER_STEPS.map((step, i) => {
                  const state = i < ledgerStep ? 'done' : i === ledgerStep ? 'active' : 'todo';
                  return (
                    <li key={step} className="flex items-center gap-3">
                      <span
                        className={cn(
                          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs',
                          state === 'done' &&
                            'border-emerald-500 bg-emerald-500/20 text-emerald-300',
                          state === 'active' &&
                            'border-indigo-500 bg-indigo-500/20 text-indigo-300',
                          state === 'todo' && 'border-gray-600 text-gray-500',
                        )}
                        aria-hidden="true"
                      >
                        {state === 'done' ? '✓' : i + 1}
                      </span>
                      <span
                        className={cn(
                          'text-sm',
                          state === 'todo' ? 'text-gray-500' : 'text-gray-200',
                        )}
                        aria-current={state === 'active' ? 'step' : undefined}
                      >
                        {step}
                      </span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="flex items-center gap-3 text-gray-300">
                <Spinner className="h-5 w-5 text-indigo-400" />
                <span className="text-sm">
                  Opening Freighter… approve the connection in your extension.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Connected — show address + disconnect */}
        {status === 'connected' && (
          <div className="mt-5">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <p className="text-xs uppercase tracking-wide text-emerald-400">Connected</p>
              <p className="mt-1 break-all font-mono text-sm text-gray-100">
                {address ?? 'Unknown address'}
              </p>
            </div>
            <button
              ref={primaryRef}
              type="button"
              onClick={onDisconnect}
              className="mt-4 w-full rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
