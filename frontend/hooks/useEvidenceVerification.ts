'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export type VerificationStatus = 'idle' | 'verifying' | 'verified' | 'mismatch' | 'error';

export interface UseEvidenceVerificationOptions {
  cid: string;
  expectedHash: string;
  gateways?: string[];
}

export interface UseEvidenceVerificationResult {
  status: VerificationStatus;
  progress: number;
  error: string | null;
  bytes: ArrayBuffer | null;
  verify: () => Promise<void>;
  reset: () => void;
}

const DEFAULT_GATEWAYS = ['/api/v1/ipfs'];

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function fetchFromGateway(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Gateway responded with ${response.status}`);
  }
  return response.arrayBuffer();
}

export function useEvidenceVerification({
  cid,
  expectedHash,
  gateways = DEFAULT_GATEWAYS,
}: UseEvidenceVerificationOptions): UseEvidenceVerificationResult {
  const [status, setStatus] = useState<VerificationStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setStatus('idle');
    setProgress(0);
    setError(null);
    setBytes(null);
  }, []);

  const verify = useCallback(async () => {
    reset();
    setStatus('verifying');

    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    const progressInterval = setInterval(() => {
      setProgress((prev) => Math.min(prev + Math.random() * 8, 90));
    }, 100);

    try {
      let buffer: ArrayBuffer | null = null;
      let lastError: Error | null = null;

      for (const gateway of gateways) {
        if (signal.aborted) return;
        try {
          const url = `${gateway}/${cid}`;
          buffer = await fetchFromGateway(url, signal);
          lastError = null;
          break;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
        }
      }

      if (!buffer) {
        throw lastError ?? new Error('Failed to fetch file from all gateways');
      }

      clearInterval(progressInterval);
      setProgress(100);

      setBytes(buffer);

      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashHex = bytesToHex(new Uint8Array(hashBuffer));

      if (hashHex === expectedHash.toLowerCase()) {
        setStatus('verified');
      } else {
        setStatus('mismatch');
      }
    } catch (err) {
      clearInterval(progressInterval);
      const message = err instanceof Error ? err.message : 'Verification failed';
      setError(message);
      setStatus('error');
    }
  }, [cid, expectedHash, gateways, reset]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { status, progress, error, bytes, verify, reset };
}
