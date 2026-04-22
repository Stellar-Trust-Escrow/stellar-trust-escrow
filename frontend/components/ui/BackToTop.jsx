'use client';

import { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';

/**
 * BackToTop
 *
 * Renders a fixed bottom-right button that appears after the user scrolls
 * past 300 px and smoothly scrolls back to the top on click.
 */
export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 300);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Back to top"
      className={cn(
        'fixed bottom-6 right-6 z-50 p-3 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg transition-opacity duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
        visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
      )}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  );
}
