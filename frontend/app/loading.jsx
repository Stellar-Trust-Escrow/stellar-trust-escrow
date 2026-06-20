/**
 * Global Loading Skeleton
 *
 * Shown automatically by Next.js during route transitions.
 * Provides a consistent loading experience and prevents layout shift (CLS).
 */

export default function Loading() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Page header skeleton */}
      <div className="space-y-3">
        <div className="h-8 w-56 bg-gray-800 rounded-lg" />
        <div className="h-4 w-80 bg-gray-800/60 rounded" />
      </div>

      {/* Stats row skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card py-5">
            <div className="h-3 w-20 bg-gray-700 rounded mb-3" />
            <div className="h-7 w-14 bg-gray-700 rounded" />
          </div>
        ))}
      </div>

      {/* Content cards skeleton */}
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card">
            <div className="h-4 w-40 bg-gray-700 rounded mb-3" />
            <div className="h-3 w-28 bg-gray-800 rounded mb-2" />
            <div className="h-3 w-32 bg-gray-800 rounded mb-2" />
            <div className="h-3 w-20 bg-gray-800 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
