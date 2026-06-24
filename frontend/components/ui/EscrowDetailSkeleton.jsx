/**
 * EscrowDetailSkeleton
 *
 * Shimmer placeholder matching the /escrow/[id] page layout:
 * - Header (title + badge + buttons)
 * - Info grid (4 cells)
 * - Parties card (2 columns)
 * - Milestones section (3 rows)
 */

import Skeleton from './Skeleton';

export default function EscrowDetailSkeleton() {
  return (
    <div
      className="space-y-8 max-w-4xl mx-auto"
      aria-busy="true"
      aria-label="Loading escrow details"
      data-testid="escrow-detail-skeleton"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Skeleton variant="heading" className="w-64" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton variant="text" className="w-24" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-28 rounded-lg" />
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
      </div>

      {/* Refresh bar */}
      <div className="flex items-center justify-between">
        <Skeleton variant="text" className="w-40" />
        <Skeleton className="h-7 w-20 rounded-lg" />
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card py-3 space-y-2">
            <Skeleton variant="text" className="w-16" />
            <Skeleton variant="heading" className="w-24" />
          </div>
        ))}
      </div>

      {/* Parties */}
      <div className="card grid grid-cols-1 md:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton variant="text" className="w-16" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton variant="text" className="w-40" />
            </div>
          </div>
        ))}
      </div>

      {/* Milestones */}
      <section>
        <Skeleton variant="heading" className="w-32 mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card flex items-center justify-between gap-4">
              <div className="space-y-1.5 flex-1">
                <Skeleton variant="text" className="w-48" />
                <Skeleton variant="text" className="w-24" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-8 w-24 rounded-lg" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
