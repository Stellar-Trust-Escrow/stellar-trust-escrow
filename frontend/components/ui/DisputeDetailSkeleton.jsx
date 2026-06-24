/**
 * DisputeDetailSkeleton
 *
 * Shimmer placeholder matching the /arbitrator/workspace/[id] page layout:
 * - Header (case title + status pill)
 * - 3-column grid: evidence explorer | main content | resolution panel
 */

import Skeleton from './Skeleton';

export default function DisputeDetailSkeleton() {
  return (
    <div
      className="min-h-screen bg-slate-950"
      aria-busy="true"
      aria-label="Loading dispute workspace"
      data-testid="dispute-detail-skeleton"
    >
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 py-8 lg:px-6">
        {/* Header */}
        <div className="rounded-[32px] border border-white/10 bg-slate-900/80 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <Skeleton className="h-3 w-48 rounded" />
              <Skeleton variant="heading" className="w-40" />
              <Skeleton variant="text" className="w-96" />
            </div>
            <Skeleton className="h-16 w-56 rounded-3xl" />
          </div>
        </div>

        {/* 3-column grid */}
        <div className="grid gap-6 lg:grid-cols-[360px_1fr_360px]">
          {/* Left — evidence list */}
          <div className="rounded-[28px] border border-white/10 bg-slate-900/70 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Skeleton className="h-3 w-28 rounded" />
                <Skeleton variant="heading" className="w-36" />
              </div>
              <Skeleton className="h-6 w-14 rounded-full" />
            </div>
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-3xl border border-white/10 bg-slate-950/60 p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 flex-1">
                      <Skeleton variant="text" className="w-36" />
                      <Skeleton variant="text" className="w-full" />
                    </div>
                    <Skeleton className="h-3 w-16 rounded" />
                  </div>
                  <Skeleton className="h-3 w-24 rounded" />
                </div>
              ))}
            </div>
          </div>

          {/* Center — party briefs + split control + notes */}
          <div className="space-y-6">
            {/* Party briefs */}
            <div className="rounded-[28px] border border-white/10 bg-slate-900/70 p-5 space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <Skeleton className="h-3 w-24 rounded" />
                  <Skeleton variant="heading" className="w-40" />
                </div>
                <Skeleton className="h-6 w-32 rounded-full" />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="rounded-3xl border border-white/10 bg-slate-950/70 p-4 space-y-3">
                    <Skeleton className="h-3 w-20 rounded" />
                    <Skeleton variant="heading" className="w-28" />
                    <Skeleton variant="text" className="w-36" />
                    <Skeleton variant="text" className="w-full" />
                    <Skeleton variant="text" className="w-5/6" />
                    <div className="rounded-2xl bg-slate-800/80 px-3 py-3 space-y-1">
                      <Skeleton variant="text" className="w-28" />
                      <Skeleton variant="heading" className="w-20" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Split control */}
            <div className="rounded-[28px] border border-white/10 bg-slate-900/70 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Skeleton className="h-3 w-24 rounded" />
                  <Skeleton variant="heading" className="w-44" />
                </div>
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
              <Skeleton className="h-10 w-full rounded-[24px]" />
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-20 rounded-3xl" />
                <Skeleton className="h-20 rounded-3xl" />
              </div>
            </div>

            {/* Notes */}
            <div className="rounded-[28px] border border-white/10 bg-slate-900/70 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Skeleton className="h-3 w-32 rounded" />
                  <Skeleton variant="heading" className="w-36" />
                </div>
                <Skeleton className="h-6 w-32 rounded-full" />
              </div>
              <Skeleton className="h-36 w-full rounded-3xl" />
              <Skeleton className="h-9 w-24 rounded-lg" />
            </div>
          </div>

          {/* Right — resolution panel */}
          <div className="space-y-6">
            <div className="rounded-[28px] border border-white/10 bg-slate-900/70 p-5 space-y-4">
              <div className="space-y-1">
                <Skeleton className="h-3 w-24 rounded" />
                <Skeleton variant="heading" className="w-36" />
              </div>
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-2xl" />
                ))}
              </div>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-slate-900/70 p-5 space-y-4">
              <Skeleton variant="heading" className="w-32" />
              <Skeleton variant="text" className="w-full" />
              <Skeleton variant="text" className="w-5/6" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
