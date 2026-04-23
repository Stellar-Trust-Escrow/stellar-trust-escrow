/**
 * useIntersectionObserver Hook
 *
 * Reusable Intersection Observer hook for lazy loading components
 * and images when they enter the viewport.
 *
 * @param {object}  options
 * @param {string}  [options.rootMargin='200px'] — load slightly before visible
 * @param {number}  [options.threshold=0]
 * @param {boolean} [options.triggerOnce=true]    — disconnect after first intersection
 * @returns {{ ref: React.RefCallback, isIntersecting: boolean }}
 *
 * Usage:
 *   const { ref, isIntersecting } = useIntersectionObserver();
 *   return <div ref={ref}>{isIntersecting && <HeavyComponent />}</div>;
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

export function useIntersectionObserver({
  rootMargin = '200px',
  threshold = 0,
  triggerOnce = true,
} = {}) {
  const [isIntersecting, setIsIntersecting] = useState(false);
  const observerRef = useRef(null);
  const elementRef = useRef(null);

  // Cleanup observer on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, []);

  const ref = useCallback(
    (node) => {
      // Disconnect previous observer
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      elementRef.current = node;

      if (!node) return;

      // SSR guard
      if (typeof IntersectionObserver === 'undefined') {
        setIsIntersecting(true);
        return;
      }

      observerRef.current = new IntersectionObserver(
        ([entry]) => {
          const intersecting = entry.isIntersecting;
          setIsIntersecting(intersecting);

          if (intersecting && triggerOnce) {
            observerRef.current?.disconnect();
            observerRef.current = null;
          }
        },
        { rootMargin, threshold },
      );

      observerRef.current.observe(node);
    },
    [rootMargin, threshold, triggerOnce],
  );

  return { ref, isIntersecting };
}
