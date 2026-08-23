'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const RATE_PRECISION = 10_000_000;

interface StreamAccrualInput {
  ratePerSecond: string | number;
  remainingBalance: string | number;
  totalAmount: string | number;
  startAt: string | number;
  lastClaimedAt?: string | number;
  status: string;
  paused?: boolean;
}

/**
 * Hook that provides a live-updating accrued balance for a payment stream.
 * Uses requestAnimationFrame for smooth 60fps animation without polling.
 */
export function useStreamAccrual(stream: StreamAccrualInput | null | undefined) {
  const [accrued, setAccrued] = useState('0');
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastValueRef = useRef(0);

  const computeAccrued = useCallback(() => {
    if (!stream) return { value: 0, progress: 0 };

    const ratePerSecond = Number(stream.ratePerSecond);
    const remainingBalance = Number(stream.remainingBalance);
    const totalAmount = Number(stream.totalAmount);
    const startAt = Number(stream.startAt) / 1000; // convert ms to seconds
    const lastClaimTime = Number(stream.lastClaimedAt)
      ? Number(stream.lastClaimedAt) / 1000
      : startAt;

    if (
      stream.status !== 'Active' ||
      stream.paused ||
      remainingBalance <= 0
    ) {
      return { value: 0, progress: totalAmount > 0 ? ((totalAmount - remainingBalance) / totalAmount) * 100 : 0 };
    }

    const now = Date.now() / 1000;
    if (now <= startAt) {
      return { value: 0, progress: 0 };
    }

    const baseline = lastClaimTime < startAt ? startAt : lastClaimTime;
    const elapsed = Math.max(0, now - baseline);
    const rawAccrued = elapsed * ratePerSecond / RATE_PRECISION;
    const value = Math.min(rawAccrued, remainingBalance);
    const drained = totalAmount - remainingBalance + value;
    const progressPct = totalAmount > 0 ? (drained / totalAmount) * 100 : 0;

    return { value, progress: Math.min(progressPct, 100) };
  }, [stream]);

  useEffect(() => {
    if (!stream) return;

    const tick = () => {
      const { value, progress: pct } = computeAccrued();
      if (value !== lastValueRef.current) {
        lastValueRef.current = value;
        setAccrued(value.toFixed(7));
        setProgress(pct);
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [computeAccrued, stream]);

  return { accrued, progress };
}
