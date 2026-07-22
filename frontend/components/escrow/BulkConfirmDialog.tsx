'use client';

import React, { useEffect } from 'react';
import { cn } from '../../lib/utils';
import { AlertTriangle, CheckCircle, Loader2, X, XCircle } from 'lucide-react';
import { BulkActionStep, BulkActionType } from '../../hooks/useBulkAction';

export interface BulkConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  step: BulkActionStep;
  actionType: BulkActionType | null;
  selectedEscrows: any[];
  eligibilityMap: Record<string, { eligible: boolean; reason?: string }>;
  isCheckingEligibility: boolean;
  executionProgress: Record<string, { status: 'idle' | 'running' | 'success' | 'failed'; error?: string }>;
  isExecuting: boolean;
  onNext: () => void;
  onPrev: () => void;
  onExecute: () => void;
  onRetryFailed: () => void;
}

export default function BulkConfirmDialog({
  isOpen,
  onClose,
  step,
  actionType,
  selectedEscrows,
  eligibilityMap,
  isCheckingEligibility,
  executionProgress,
  isExecuting,
  onNext,
  onPrev,
  onExecute,
  onRetryFailed,
}: BulkConfirmDialogProps) {
  const eligibleEscrows = selectedEscrows.filter((e) => eligibilityMap[e.id]?.eligible);
  const ineligibleEscrows = selectedEscrows.filter((e) => eligibilityMap[e.id] && !eligibilityMap[e.id].eligible);
  const hasEligible = eligibleEscrows.length > 0;

  // Calculate totals
  const totalAmount = selectedEscrows.reduce((sum, e) => {
    const val = parseFloat((e.totalAmount || e.amount || '0').replace(/[^0-9.]/g, ''));
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  const currencySymbol = selectedEscrows[0]?.totalAmount?.split(' ')[1] || 'USDC';

  // Handle Keyboard Navigation: Escape to cancel, Enter to advance
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (step === 'review') {
          onNext();
        } else if (step === 'confirm' && hasEligible && !isCheckingEligibility) {
          onExecute();
        } else if (step === 'summary') {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, step, onClose, onNext, onExecute, hasEligible, isCheckingEligibility]);

  if (!isOpen) return null;

  const actionName = actionType === 'release' ? 'Release Milestones' : 'Cancel Escrow';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-dialog-title"
    >
      <div className="bg-gray-900 border border-gray-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-800">
          <div>
            <h2 id="bulk-dialog-title" className="text-lg font-bold text-white">
              Bulk Action: {actionName}
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Step{' '}
              {step === 'review'
                ? '1 of 4: Review'
                : step === 'confirm'
                  ? '2 of 4: Confirm'
                  : step === 'execute'
                    ? '3 of 4: Execute'
                    : '4 of 4: Summary'}
            </p>
          </div>
          {!isExecuting && (
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 transition-colors p-1"
              aria-label="Close dialog"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {/* STEP 1: REVIEW */}
          {step === 'review' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-300">
                You are about to perform the bulk action <strong>{actionName}</strong> on the following{' '}
                {selectedEscrows.length} escrows:
              </p>
              <div className="border border-gray-800 rounded-xl overflow-hidden bg-gray-950">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-400 bg-gray-900/50">
                      <th className="p-3">ID</th>
                      <th className="p-3">Title</th>
                      <th className="p-3">Counterparty</th>
                      <th className="p-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800 text-gray-300 font-mono">
                    {selectedEscrows.map((e) => (
                      <tr key={e.id}>
                        <td className="p-3">#{e.id}</td>
                        <td className="p-3 truncate max-w-[180px] font-sans font-medium text-white">
                          {e.title}
                        </td>
                        <td className="p-3 truncate max-w-[120px]">{e.counterparty}</td>
                        <td className="p-3 text-right font-semibold text-white">{e.totalAmount || e.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                <span className="text-sm font-semibold text-indigo-300">Total Affected Amount:</span>
                <span className="text-base font-bold text-white font-mono">
                  {totalAmount.toLocaleString()} {currencySymbol}
                </span>
              </div>
            </div>
          )}

          {/* STEP 2: CONFIRM */}
          {step === 'confirm' && (
            <div className="space-y-4">
              {isCheckingEligibility ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-400">
                  <Loader2 className="animate-spin text-indigo-500" size={32} />
                  <p className="text-sm">Verifying escrow eligibility...</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-300">
                    Reviewing contract eligibility requirements. Only eligible escrows will proceed:
                  </p>

                  <div className="space-y-2">
                    {/* Eligible List */}
                    {eligibleEscrows.map((e) => (
                      <div
                        key={e.id}
                        className="flex items-center justify-between p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-sm"
                      >
                        <div className="flex items-center gap-2.5">
                          <CheckCircle className="text-emerald-500 shrink-0" size={16} />
                          <span className="font-semibold text-white">#{e.id}</span>
                          <span className="text-gray-300 truncate max-w-[280px]">{e.title}</span>
                        </div>
                        <span className="font-mono text-emerald-400 font-semibold">{e.totalAmount || e.amount}</span>
                      </div>
                    ))}

                    {/* Ineligible List */}
                    {ineligibleEscrows.map((e) => (
                      <div
                        key={e.id}
                        className="p-3 rounded-xl border border-red-500/20 bg-red-500/5 text-sm space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <XCircle className="text-red-500 shrink-0" size={16} />
                            <span className="font-semibold text-white">#{e.id}</span>
                            <span className="text-gray-400 truncate max-w-[280px]">{e.title}</span>
                          </div>
                          <span className="font-mono text-red-400/70">{e.totalAmount || e.amount}</span>
                        </div>
                        <p className="text-xs text-red-300/80 pl-6">
                          Reason: {eligibilityMap[e.id]?.reason || 'Ineligible for this action'}
                        </p>
                      </div>
                    ))}
                  </div>

                  {ineligibleEscrows.length > 0 && (
                    <div className="flex gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300">
                      <AlertTriangle className="shrink-0" size={16} />
                      <p>
                        Warning: {ineligibleEscrows.length} ineligible escrow(s) will be excluded. Only{' '}
                        {eligibleEscrows.length} eligible escrow(s) will be processed.
                      </p>
                    </div>
                  )}

                  {!hasEligible && (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-center text-sm text-red-300">
                      None of the selected escrows are eligible for this action.
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* STEP 3: EXECUTE */}
          {step === 'execute' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-300">
                Executing blockchain transactions sequentially. Please approve each prompt in your wallet:
              </p>
              <div className="space-y-2.5">
                {eligibleEscrows.map((e) => {
                  const status = executionProgress[e.id]?.status || 'idle';
                  const errorMsg = executionProgress[e.id]?.error;
                  return (
                    <div
                      key={e.id}
                      className={cn(
                        'flex items-center justify-between p-3.5 rounded-xl border text-sm transition-all duration-300',
                        status === 'running'
                          ? 'border-indigo-500 bg-indigo-500/5 shadow-indigo-500/5 shadow-md'
                          : status === 'success'
                            ? 'border-emerald-500/30 bg-emerald-500/5'
                            : status === 'failed'
                              ? 'border-red-500/30 bg-red-500/5'
                              : 'border-gray-800 bg-gray-950/40 text-gray-500',
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {status === 'idle' && (
                          <span className="h-4 w-4 rounded-full border border-gray-700 bg-gray-900" />
                        )}
                        {status === 'running' && (
                          <Loader2 className="animate-spin text-indigo-500" size={16} />
                        )}
                        {status === 'success' && <CheckCircle className="text-emerald-500" size={16} />}
                        {status === 'failed' && <XCircle className="text-red-500" size={16} />}
                        <div>
                          <p className="font-semibold text-white">
                            #{e.id} - {e.title}
                          </p>
                          {status === 'failed' && errorMsg && (
                            <p className="text-xs text-red-400 mt-0.5">{errorMsg}</p>
                          )}
                        </div>
                      </div>
                      <span className="font-mono text-xs text-gray-400">
                        {status === 'idle' && 'Waiting...'}
                        {status === 'running' && 'Processing...'}
                        {status === 'success' && 'Succeeded'}
                        {status === 'failed' && 'Failed'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 4: SUMMARY */}
          {step === 'summary' && (
            <div className="space-y-4">
              <div className="text-center py-6 space-y-2">
                <h3 className="text-2xl font-bold text-white">Execution Summary</h3>
                <p className="text-sm text-gray-400">
                  {Object.values(executionProgress).filter((p) => p.status === 'success').length} succeeded,{' '}
                  {Object.values(executionProgress).filter((p) => p.status === 'failed').length} failed
                </p>
              </div>

              <div className="space-y-2.5">
                {eligibleEscrows.map((e) => {
                  const status = executionProgress[e.id]?.status;
                  const errorMsg = executionProgress[e.id]?.error;
                  if (status !== 'failed') return null;

                  return (
                    <div
                      key={e.id}
                      className="p-3.5 rounded-xl border border-red-500/20 bg-red-500/5 text-sm space-y-1"
                    >
                      <div className="flex items-center gap-2">
                        <XCircle className="text-red-500" size={16} />
                        <span className="font-semibold text-white">
                          #{e.id} - {e.title}
                        </span>
                      </div>
                      <p className="text-xs text-red-300 pl-6">Error: {errorMsg || 'Unknown error'}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-5 border-t border-gray-800 bg-gray-950 flex items-center justify-between gap-3">
          <div>
            {step === 'confirm' && (
              <button
                type="button"
                onClick={onPrev}
                disabled={isCheckingEligibility}
                className="text-xs font-semibold text-gray-400 hover:text-white transition-colors disabled:opacity-50"
              >
                Back to Review
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {!isExecuting && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-2 text-xs font-semibold text-gray-300 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-gray-700"
              >
                {step === 'summary' ? 'Close' : 'Cancel'}
              </button>
            )}

            {step === 'review' && (
              <button
                type="button"
                onClick={onNext}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                Review Eligibility
              </button>
            )}

            {step === 'confirm' && (
              <button
                type="button"
                onClick={onExecute}
                disabled={!hasEligible || isCheckingEligibility}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                Confirm & Execute ({eligibleEscrows.length})
              </button>
            )}

            {step === 'summary' && Object.values(executionProgress).some((p) => p.status === 'failed') && (
              <button
                type="button"
                onClick={onRetryFailed}
                className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-500 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                Retry Failed
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
