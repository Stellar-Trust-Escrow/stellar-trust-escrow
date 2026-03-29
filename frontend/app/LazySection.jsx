/**
 * LazySection — Client-side lazy loading wrapper for page sections.
 *
 * Uses IntersectionObserver to defer rendering of below-the-fold content
 * until the user scrolls near it. Reserves space via minHeight to prevent CLS.
 *
 * This is a thin client wrapper so the parent page can remain a Server Component.
 */

'use client';

import LazyComponent from '../components/ui/LazyComponent';

export default function LazySection({ children, minHeight = '200px', ...rest }) {
  return (
    <LazyComponent
      minHeight={minHeight}
      rootMargin="300px"
      fallback={
        <div className="animate-pulse space-y-4" style={{ minHeight }}>
          <div className="h-8 w-48 bg-gray-800 rounded-lg mx-auto" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card">
                <div className="h-4 w-32 bg-gray-700 rounded mb-3" />
                <div className="h-3 w-full bg-gray-800 rounded mb-2" />
                <div className="h-3 w-3/4 bg-gray-800 rounded" />
              </div>
            ))}
          </div>
        </div>
      }
      {...rest}
    >
      {children}
    </LazyComponent>
  );
}
