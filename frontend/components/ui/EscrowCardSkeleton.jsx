/**
 * EscrowCardSkeleton
 *
 * Pulse-animated placeholder that mirrors EscrowCard's layout.
 * Rendered by EscrowCard while useEscrow / useUserEscrows is loading.
 */

import Skeleton from './Skeleton';

export default function EscrowCardSkeleton() {
  return (
    <div
      className="card block"
      aria-busy="true"
      aria-label="Loading escrow"
      data-testid="escrow-card-skeleton"
    >
      {/* Header Row — title + badge */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0 space-y-1.5">
          <Skeleton variant="heading" className="w-3/4" />
          <Skeleton variant="text" className="w-1/2" />
        </div>
        {/* Badge placeholder */}
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>

      {/* Amount */}
      <Skeleton variant="text" className="w-28 mb-3" />

      {/* Milestone progress */}
      <div className="space-y-1">
        <div className="flex justify-between">
          <Skeleton variant="text" className="w-20" />
          <Skeleton variant="text" className="w-10" />
        </div>
        {/* Progress bar */}
        <Skeleton className="h-1.5 w-full rounded-full" />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-800">
        <Skeleton variant="text" className="w-8" />
        <Skeleton variant="text" className="w-24" />
      </div>
    </div>
  );
}
