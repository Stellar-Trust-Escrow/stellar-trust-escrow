import * as React from 'react';

export interface UseSwipeGestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeDown?: () => void;
  axis?: 'x' | 'y';
  threshold?: number;
}

export interface UseSwipeGestureResult {
  offset: number;
  swiping: boolean;
  bind: {
    onPointerDown: (event: React.PointerEvent<any>) => void;
    onPointerMove: (event: React.PointerEvent<any>) => void;
    onPointerUp: (event: React.PointerEvent<any>) => void;
    onPointerCancel: (event: React.PointerEvent<any>) => void;
  };
}

export function useSwipeGesture(options?: UseSwipeGestureOptions): UseSwipeGestureResult;
export default useSwipeGesture;
