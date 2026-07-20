'use client';

/**
 * useMediaQuery — subscribe to a CSS media query and react to changes.
 *
 * Used to switch modal presentation to a bottom-sheet drawer below the `md`
 * breakpoint (Issue #1444) and for other responsive behaviour.
 *
 * @param {string} query — a valid CSS media query, e.g. '(max-width: 767px)'
 * @returns {boolean} whether the query currently matches
 */

import { useEffect, useState } from 'react';

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mql = window.matchMedia(query);
    const handler = () => setMatches(mql.matches);

    // Sync immediately so the first client render is correct.
    handler();

    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }

    // Safari < 14 fallback.
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, [query]);

  return matches;
}

/** Convenience helper: true when the viewport is narrower than Tailwind's `md`. */
export function useIsMobile() {
  return useMediaQuery('(max-width: 767px)');
}

export default useMediaQuery;
