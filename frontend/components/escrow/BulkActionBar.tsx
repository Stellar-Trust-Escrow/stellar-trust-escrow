'use client';

import React from 'react';
import { cn } from '../../lib/utils';
import { Download, ShieldCheck, Trash2, Undo2, X } from 'lucide-react';
import { BulkActionType, UndoToastState } from '../../hooks/useBulkAction';

export interface BulkActionBarProps {
  selectedCount: number;
  isSelectMode: boolean;
  onExitSelectMode: () => void;
  onTriggerAction: (type: BulkActionType) => void;
  undoToast: UndoToastState | null;
  onUndo: () => void;
  onCloseUndo: () => void;
}

export default function BulkActionBar({
  selectedCount,
  isSelectMode,
  onExitSelectMode,
  onTriggerAction,
  undoToast,
  onUndo,
  onCloseUndo,
}: BulkActionBarProps) {
  const showActionBar = isSelectMode && selectedCount > 0;

  return (
    <>
      {/* Undo Toast */}
      {undoToast?.visible && (
        <div
          className="fixed bottom-24 right-4 z-50 flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl p-4 shadow-2xl animate-in slide-in-from-bottom-5 duration-300 text-sm max-w-md"
          role="status"
          aria-live="polite"
        >
          <div className="flex-1">
            <p className="font-semibold text-white">Bulk action completed</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {undoToast.actionType === 'release'
                ? `Released milestones for ${undoToast.affectedIds.length} escrows.`
                : `Cancelled ${undoToast.affectedIds.length} escrows.`}
            </p>
          </div>
          <button
            onClick={onUndo}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs px-3 py-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400"
            aria-label="Undo bulk action"
          >
            <Undo2 size={13} />
            Undo
          </button>
          <button
            onClick={onCloseUndo}
            className="text-gray-500 hover:text-gray-300 transition-colors p-1"
            aria-label="Dismiss toast"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Floating Action Bar */}
      <div
        className={cn(
          'fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-2xl px-4 transition-all duration-300 ease-out',
          showActionBar ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12 pointer-events-none',
        )}
      >
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-gray-900/90 backdrop-blur-md border border-indigo-500/30 rounded-2xl p-4 shadow-indigo-500/5 shadow-2xl">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-6 px-2.5 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold border border-indigo-500/30 animate-pulse">
              {selectedCount} selected
            </span>
            <button
              onClick={onExitSelectMode}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              Cancel Selection
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => onTriggerAction('release')}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs px-3.5 py-2 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              <ShieldCheck size={14} />
              Release Milestones
            </button>

            <button
              onClick={() => onTriggerAction('cancel')}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 font-medium text-xs px-3.5 py-2 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
            >
              <Trash2 size={14} />
              Cancel Escrows
            </button>

            <button
              onClick={() => onTriggerAction('export')}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium text-xs px-3.5 py-2 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-600"
            >
              <Download size={14} />
              Export CSV
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
