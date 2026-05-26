'use client';

/**
 * NavigationProgress
 *
 * Thin top-bar loading indicator that appears during route transitions.
 * Uses Next.js navigation events (usePathname change) to show/hide.
 */

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

export default function NavigationProgress() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);
  const prevPath = useRef(pathname);

  useEffect(() => {
    if (pathname !== prevPath.current) {
      prevPath.current = pathname;
      setVisible(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setVisible(false), 400);
    }
    return () => clearTimeout(timerRef.current);
  }, [pathname]);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 z-[9999] h-0.5 w-full bg-indigo-500 animate-[progress_0.4s_ease-out_forwards]"
    />
  );
}
