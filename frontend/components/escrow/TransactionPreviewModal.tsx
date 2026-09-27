'use client';

import React, { useState } from 'react';
import { SimulationResult } from '../../lib/soroban-simulator';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  DollarSign,
  Loader2,
  ShieldAlert,
  X,
} from 'lucide-react';

export interface TransactionPreviewModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  simulationResult: SimulationResult | null;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
}

export const TransactionPreviewModal: React.FC<TransactionPreviewModalProps> = ({
  isOpen,
  isLoading = false,
  simulationResult,
  onConfirm,
  onCancel,
  title = 'Transaction Simulation Preview',
}) => {
  const [isStateDiffOpen, setIsStateDiffOpen] = useState(false);

  if (!isOpen) return null;

  const hasHighRisk = simulationResult?.risk_indicators.some((r) => r.level === 'high');
  const hasMediumRisk = simulationResult?.risk_indicators.some((r) => r.level === 'medium');
  const isFailed = !simulationResult?.success;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div className="relative w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              {title}
            </h3>
          </div>
          <button
            onClick={onCancel}
            aria-label="Close"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Simulating transaction...
              </p>
              <p className="text-xs text-slate-400">
                Dry-running invocation against Soroban RPC to inspect state changes and fees
              </p>
            </div>
          ) : !simulationResult ? (
            <div className="py-8 text-center text-sm text-slate-500">
              No simulation data available.
            </div>
          ) : (
            <>
              {/* Description banner */}
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-4 border border-slate-200 dark:border-slate-700/60">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  What this transaction does
                </span>
                <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">
                  {simulationResult.action_summary.description}
                </p>
                <div className="mt-2 text-xs font-mono text-slate-500 dark:text-slate-400">
                  Method: <span className="font-semibold">{simulationResult.action_summary.method}</span>
                </div>
              </div>

              {/* Simulation failure error alert */}
              {isFailed && (
                <div className="rounded-xl bg-red-50 dark:bg-red-950/40 p-4 border border-red-200 dark:border-red-900/60 flex items-start gap-3 text-red-800 dark:text-red-200">
                  <ShieldAlert className="w-5 h-5 mt-0.5 text-red-600 dark:text-red-400 shrink-0" />
                  <div>
                    <h4 className="text-sm font-semibold">Simulation Failed</h4>
                    <p className="text-xs mt-1 text-red-700 dark:text-red-300">
                      {simulationResult.error || 'Contract execution reverted during simulation.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Risk Indicators */}
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Safety & Risk Assessment
                </span>
                <div className="space-y-2">
                  {simulationResult.risk_indicators.map((risk, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg flex items-start gap-2.5 text-xs font-medium border ${
                        risk.level === 'high'
                          ? 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900/40'
                          : risk.level === 'medium'
                          ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/40'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/40'
                      }`}
                    >
                      {risk.level === 'high' ? (
                        <ShieldAlert className="w-4 h-4 shrink-0 text-red-600" />
                      ) : risk.level === 'medium' ? (
                        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                      )}
                      <span>{risk.message}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fee Breakdown Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Fee Breakdown
                  </span>
                  <div className="flex items-center text-xs text-indigo-600 dark:text-indigo-400">
                    <DollarSign className="w-3.5 h-3.5 mr-0.5" />
                    <span>~${simulationResult.fee_estimate.total_fee_usd} USD</span>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  <div className="flex justify-between px-3.5 py-2.5 bg-slate-50/50 dark:bg-slate-800/30">
                    <span className="text-slate-600 dark:text-slate-400">Resource Fee</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">
                      {(simulationResult.fee_estimate.resource_fee / 10_000_000).toFixed(7)} XLM
                    </span>
                  </div>
                  <div className="flex justify-between px-3.5 py-2.5 bg-slate-50/50 dark:bg-slate-800/30">
                    <span className="text-slate-600 dark:text-slate-400">Base Network Fee</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">
                      {(simulationResult.fee_estimate.base_fee / 10_000_000).toFixed(7)} XLM
                    </span>
                  </div>
                  <div className="flex justify-between px-3.5 py-2.5 font-semibold bg-slate-100/70 dark:bg-slate-800/70">
                    <span className="text-slate-900 dark:text-white">Total Estimated Fee</span>
                    <span className="font-mono text-indigo-600 dark:text-indigo-400">
                      {simulationResult.fee_estimate.total_fee_xlm} XLM (${simulationResult.fee_estimate.total_fee_usd} USD)
                    </span>
                  </div>
                </div>
              </div>

              {/* State Diff Collapsible */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setIsStateDiffOpen(!isStateDiffOpen)}
                  className="flex items-center justify-between w-full py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
                >
                  <span className="flex items-center gap-1.5">
                    {isStateDiffOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    Storage State Diff ({simulationResult.state_diff.length} changes)
                  </span>
                  <span className="text-xs font-normal lowercase text-slate-400">
                    {isStateDiffOpen ? 'hide' : 'inspect'}
                  </span>
                </button>

                {isStateDiffOpen && (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden text-xs">
                    {simulationResult.state_diff.length === 0 ? (
                      <div className="p-3 text-slate-500 italic text-center">
                        No persistent ledger state modifications detected.
                      </div>
                    ) : (
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 font-semibold text-slate-600 dark:text-slate-300">
                            <th className="p-2.5">Key</th>
                            <th className="p-2.5">Old Value</th>
                            <th className="p-2.5">New Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                          {simulationResult.state_diff.map((diff, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                              <td className="p-2.5 text-slate-700 dark:text-slate-300 font-medium truncate max-w-[120px]">
                                {diff.key}
                              </td>
                              <td className="p-2.5 text-red-600 dark:text-red-400">
                                {String(diff.old_value)}
                              </td>
                              <td className="p-2.5 text-emerald-600 dark:text-emerald-400">
                                {String(diff.new_value)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading || isFailed}
            className={`px-4 py-2 text-xs font-semibold text-white rounded-lg shadow transition flex items-center gap-1.5 ${
              isFailed
                ? 'bg-slate-400 cursor-not-allowed'
                : hasHighRisk
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            Sign & Submit
          </button>
        </div>
      </div>
    </div>
  );
};

export default TransactionPreviewModal;
