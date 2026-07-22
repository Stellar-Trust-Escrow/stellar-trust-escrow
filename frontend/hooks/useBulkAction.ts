import { useState, useCallback, useRef } from 'react';
import { buildCancelEscrowTx, buildBatchApproveMilestonesTx, broadcastTransaction } from '../lib/stellar';
import { exportToCSV } from '../lib/csvExport';

export interface UseBulkActionProps {
  escrows: any[];
  setEscrows: React.Dispatch<React.SetStateAction<any[]>>;
  selectedIds: string[];
  clearSelection: () => void;
  address: string | null;
  signTx: (unsignedXdr: string) => Promise<string>;
}

export type BulkActionStep = 'review' | 'confirm' | 'execute' | 'summary';
export type BulkActionType = 'release' | 'cancel' | 'export';

export interface UndoToastState {
  visible: boolean;
  actionType: BulkActionType;
  affectedIds: string[];
}

export function useBulkAction({
  escrows,
  setEscrows,
  selectedIds,
  clearSelection,
  address,
  signTx,
}: UseBulkActionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<BulkActionStep>('review');
  const [actionType, setActionType] = useState<BulkActionType | null>(null);

  const [eligibilityMap, setEligibilityMap] = useState<Record<string, { eligible: boolean; reason?: string }>>({});
  const [escrowDetailsMap, setEscrowDetailsMap] = useState<Record<string, any>>({});
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(false);

  const [executionProgress, setExecutionProgress] = useState<
    Record<string, { status: 'idle' | 'running' | 'success' | 'failed'; error?: string }>
  >({});
  const [isExecuting, setIsExecuting] = useState(false);

  const [undoToast, setUndoToast] = useState<UndoToastState | null>(null);
  const [previousEscrows, setPreviousEscrows] = useState<any[]>([]);
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);

  const openDialog = useCallback(
    async (type: BulkActionType) => {
      setActionType(type);
      setStep('review');
      setIsOpen(true);
      setExecutionProgress({});
      setEligibilityMap({});
      setEscrowDetailsMap({});

      // Start fetching details in background for Step 2
      setIsCheckingEligibility(true);
      const newMap: Record<string, { eligible: boolean; reason?: string }> = {};
      const detailsMap: Record<string, any> = {};

      try {
        await Promise.all(
          selectedIds.map(async (id) => {
            try {
              const res = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/escrows/${id}`
              );
              if (!res.ok) throw new Error(`HTTP error ${res.status}`);
              const detail = await res.json();
              detailsMap[id] = detail;

              // Perform eligibility check
              if (type === 'release') {
                const status = detail.status?.toLowerCase();
                if (status !== 'active') {
                  newMap[id] = { eligible: false, reason: `Escrow is in ${detail.status} status, must be Active` };
                  return;
                }
                const submittedMilestones = detail.milestones?.filter((m: any) => m.status === 'Submitted') || [];
                const pendingMilestones = detail.milestones?.filter((m: any) => m.status === 'Pending') || [];
                const rejectedMilestones = detail.milestones?.filter((m: any) => m.status === 'Rejected') || [];

                if (!detail.milestones || detail.milestones.length === 0) {
                  newMap[id] = { eligible: false, reason: 'Escrow has no milestones' };
                } else if (pendingMilestones.length > 0 || rejectedMilestones.length > 0) {
                  newMap[id] = {
                    eligible: false,
                    reason: 'Not all milestones have been submitted (some are Pending or Rejected)',
                  };
                } else if (submittedMilestones.length === 0) {
                  newMap[id] = { eligible: false, reason: 'No submitted milestones to release' };
                } else {
                  newMap[id] = { eligible: true };
                }
              } else if (type === 'cancel') {
                const status = detail.status?.toLowerCase();
                // Spec: Bulk cancel: Status = Active or Funded, no disputes
                const validStatuses = ['active', 'funded', 'in_progress'];
                const displayStatus = detail.status;
                if (
                  !status ||
                  (!validStatuses.includes(status) && displayStatus !== 'Active' && displayStatus !== 'Funded')
                ) {
                  newMap[id] = { eligible: false, reason: `Escrow is in ${displayStatus} status, must be Active or Funded` };
                  return;
                }
                if (detail.dispute && !detail.dispute.resolvedAt) {
                  newMap[id] = { eligible: false, reason: 'Escrow has an active dispute' };
                } else {
                  newMap[id] = { eligible: true };
                }
              }
            } catch (err: any) {
              newMap[id] = { eligible: false, reason: `Failed to fetch escrow details: ${err.message}` };
            }
          })
        );
      } finally {
        setEligibilityMap(newMap);
        setEscrowDetailsMap(detailsMap);
        setIsCheckingEligibility(false);
      }
    },
    [selectedIds]
  );

  const closeDialog = useCallback(() => {
    setIsOpen(false);
  }, []);

  const nextStep = useCallback(() => {
    setStep((prev) => {
      if (prev === 'review') return 'confirm';
      if (prev === 'confirm') return 'execute';
      if (prev === 'execute') return 'summary';
      return prev;
    });
  }, []);

  const prevStep = useCallback(() => {
    setStep((prev) => {
      if (prev === 'confirm') return 'review';
      if (prev === 'execute') return 'confirm';
      return prev;
    });
  }, []);

  const executeActionForEscrow = async (id: string, currentProgress: any) => {
    if (currentProgress[id]?.status === 'success') return true;

    setExecutionProgress((prev) => ({ ...prev, [id]: { status: 'running' } }));
    try {
      const detail = escrowDetailsMap[id];
      if (!detail) throw new Error('Escrow details missing');

      let txXdr: string;
      if (actionType === 'release') {
        const submittedMilestones = detail.milestones?.filter((m: any) => m.status === 'Submitted') || [];
        const milestoneIds = submittedMilestones.map((m: any) => m.milestoneIndex ?? m.id);
        if (milestoneIds.length === 0) throw new Error('No submitted milestones to release');

        txXdr = await buildBatchApproveMilestonesTx({
          sourceAddress: address!,
          escrowId: id,
          milestoneIds,
        });
      } else {
        txXdr = await buildCancelEscrowTx({
          sourceAddress: address!,
          escrowId: id,
        });
      }

      const signedXdr = await signTx(txXdr);
      await broadcastTransaction(signedXdr);

      setExecutionProgress((prev) => ({ ...prev, [id]: { status: 'success' } }));
      return true;
    } catch (err: any) {
      setExecutionProgress((prev) => ({
        ...prev,
        [id]: { status: 'failed', error: err.message || 'Transaction failed' },
      }));
      return false;
    }
  };

  const handlePostExecution = useCallback(
    (results: Record<string, 'success' | 'failed'>) => {
      const succeededIds = Object.keys(results).filter((id) => results[id] === 'success');
      if (succeededIds.length === 0) return;

      // Save previous state
      setPreviousEscrows(escrows);

      // Perform optimistic update
      setEscrows((prevList) =>
        prevList.map((escrow) => {
          const idStr = String(escrow.id);
          if (succeededIds.includes(idStr)) {
            return {
              ...escrow,
              status: actionType === 'release' ? 'Completed' : 'Cancelled',
            };
          }
          return escrow;
        })
      );

      // Clear selection
      clearSelection();

      // Show Undo Toast
      setUndoToast({
        visible: true,
        actionType: actionType!,
        affectedIds: succeededIds,
      });

      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = setTimeout(() => {
        setUndoToast(null);
      }, 5000);
    },
    [escrows, setEscrows, actionType, clearSelection]
  );

  const executeAction = useCallback(async () => {
    const eligibleIds = selectedIds.filter((id) => eligibilityMap[id]?.eligible);
    if (eligibleIds.length === 0) return;

    setStep('execute');
    setIsExecuting(true);

    const progressObj: Record<string, { status: 'idle' | 'running' | 'success' | 'failed'; error?: string }> = {};
    for (const id of eligibleIds) {
      progressObj[id] = { status: 'idle' };
    }
    setExecutionProgress(progressObj);

    const results: Record<string, 'success' | 'failed'> = {};
    for (const id of eligibleIds) {
      const ok = await executeActionForEscrow(id, progressObj);
      results[id] = ok ? 'success' : 'failed';
      progressObj[id] = { status: ok ? 'success' : 'failed' };
    }

    setIsExecuting(false);
    setStep('summary');

    handlePostExecution(results);
  }, [selectedIds, eligibilityMap, actionType, address, signTx, escrowDetailsMap, handlePostExecution]);

  const retryFailed = useCallback(async () => {
    const failedIds = Object.keys(executionProgress).filter((id) => executionProgress[id].status === 'failed');
    if (failedIds.length === 0) return;

    setStep('execute');
    setIsExecuting(true);

    const progressObj = { ...executionProgress };
    const results: Record<string, 'success' | 'failed'> = {};

    for (const id of failedIds) {
      const ok = await executeActionForEscrow(id, progressObj);
      results[id] = ok ? 'success' : 'failed';
      progressObj[id] = { status: ok ? 'success' : 'failed' };
    }

    setIsExecuting(false);
    setStep('summary');

    handlePostExecution(results);
  }, [executionProgress, actionType, address, signTx, escrowDetailsMap, handlePostExecution]);

  const triggerExport = useCallback(() => {
    const selectedEscrows = escrows.filter((e) => selectedIds.includes(String(e.id)));
    if (selectedEscrows.length === 0) return;

    const exportData = selectedEscrows.map((e) => ({
      ID: e.id,
      Title: e.title,
      Counterparty: e.counterparty,
      Amount: e.totalAmount || e.amount,
      Status: e.status,
      Role: e.role || 'client',
      Progress: e.milestoneProgress || '0/0',
    }));

    exportToCSV(exportData, `escrows_export_${Date.now()}`);
    clearSelection();
  }, [escrows, selectedIds, clearSelection]);

  const triggerUndo = useCallback(() => {
    if (!undoToast) return;
    setEscrows(previousEscrows);
    setUndoToast(null);
  }, [undoToast, previousEscrows, setEscrows]);

  const closeUndoToast = useCallback(() => {
    setUndoToast(null);
  }, []);

  return {
    isOpen,
    step,
    actionType,
    selectedEscrows: escrows.filter((e) => selectedIds.includes(String(e.id))),
    eligibilityMap,
    isCheckingEligibility,
    executionProgress,
    isExecuting,
    undoToast,
    openDialog,
    closeDialog,
    nextStep,
    prevStep,
    executeAction,
    retryFailed,
    triggerExport,
    triggerUndo,
    closeUndoToast,
  };
}
