'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../lib/api/client';

/** Supported export output formats. */
export type ExportFormat = 'csv' | 'xlsx';

/** Escrow statuses that can be used to filter an export. */
export type EscrowStatus = 'Active' | 'Completed' | 'Disputed' | 'Cancelled';

/** Parameters accepted when starting an escrow-history export. */
export interface ExportParams {
  format: ExportFormat;
  dateFrom: string;
  dateTo: string;
  status?: EscrowStatus[];
}

/** Lifecycle phase of the export request as tracked on the client. */
export type ExportPhase = 'idle' | 'pending' | 'processing' | 'done' | 'failed';

export interface UseEscrowExportResult {
  phase: ExportPhase;
  progress: number;
  jobId: string | null;
  downloadUrl: string | null;
  error: string | null;
  estimatedSeconds: number | null;
  isBusy: boolean;
  startExport: (params: ExportParams) => Promise<void>;
  retry: () => Promise<void>;
  reset: () => void;
}

/** How often (ms) to poll the job-status endpoint. */
const POLL_INTERVAL_MS = 3000;
/** How long (ms) a completed export stays visible before auto-dismissal. */
const AUTO_DISMISS_MS = 10000;

/**
 * Drives the async escrow-history export flow:
 *  1. POST the request to enqueue a background job.
 *  2. Poll the job status every 3s until it completes or fails.
 *  3. Surface progress + a signed download URL, and auto-dismiss on success.
 *
 * All timers are cleaned up on unmount and between runs so no polling leaks.
 */
export function useEscrowExport(): UseEscrowExportResult {
  const [phase, setPhase] = useState<ExportPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [estimatedSeconds, setEstimatedSeconds] = useState<number | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastParamsRef = useRef<ExportParams | null>(null);

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const clearDismiss = useCallback(() => {
    if (dismissRef.current) {
      clearTimeout(dismissRef.current);
      dismissRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearPoll();
    clearDismiss();
    setPhase('idle');
    setProgress(0);
    setJobId(null);
    setDownloadUrl(null);
    setError(null);
    setEstimatedSeconds(null);
  }, [clearPoll, clearDismiss]);

  const pollStatus = useCallback(
    async (id: string) => {
      try {
        const { data } = await api.get(`/v1/escrows/export/${id}/status`);

        if (typeof data.progress === 'number') setProgress(data.progress);

        if (data.status === 'done') {
          clearPoll();
          setProgress(100);
          setDownloadUrl(data.downloadUrl ?? null);
          setPhase('done');
          clearDismiss();
          dismissRef.current = setTimeout(() => reset(), AUTO_DISMISS_MS);
        } else if (data.status === 'failed') {
          clearPoll();
          setError(data.error ?? 'Export failed');
          setPhase('failed');
        } else {
          setPhase(data.status === 'processing' ? 'processing' : 'pending');
        }
      } catch (err: unknown) {
        clearPoll();
        setError(resolveErrorMessage(err, 'Failed to check export status'));
        setPhase('failed');
      }
    },
    [clearPoll, clearDismiss, reset],
  );

  const startExport = useCallback(
    async (params: ExportParams) => {
      clearPoll();
      clearDismiss();
      lastParamsRef.current = params;

      setPhase('pending');
      setProgress(0);
      setDownloadUrl(null);
      setError(null);

      try {
        const { data } = await api.post('/v1/escrows/export', params);
        setJobId(data.jobId);
        setEstimatedSeconds(data.estimatedSeconds ?? null);

        // Kick off polling immediately, then on an interval.
        await pollStatus(data.jobId);
        clearPoll();
        pollRef.current = setInterval(() => pollStatus(data.jobId), POLL_INTERVAL_MS);
      } catch (err: unknown) {
        setError(resolveErrorMessage(err, 'Failed to start export'));
        setPhase('failed');
      }
    },
    [clearPoll, clearDismiss, pollStatus],
  );

  const retry = useCallback(async () => {
    if (lastParamsRef.current) {
      await startExport(lastParamsRef.current);
    }
  }, [startExport]);

  // Clean up any outstanding timers when the component unmounts.
  useEffect(() => {
    return () => {
      clearPoll();
      clearDismiss();
    };
  }, [clearPoll, clearDismiss]);

  return {
    phase,
    progress,
    jobId,
    downloadUrl,
    error,
    estimatedSeconds,
    isBusy: phase === 'pending' || phase === 'processing',
    startExport,
    retry,
    reset,
  };
}

function resolveErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null) {
    const maybe = err as { response?: { data?: { error?: string } }; message?: string };
    return maybe.response?.data?.error ?? maybe.message ?? fallback;
  }
  return fallback;
}

export default useEscrowExport;
