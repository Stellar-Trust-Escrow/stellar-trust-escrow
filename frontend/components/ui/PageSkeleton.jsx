import Skeleton from './Skeleton';

const PageSkeleton = () => (
  <div className="space-y-8 p-6 max-w-7xl mx-auto">
    {/* Header */}
    <div className="space-y-4">
      <Skeleton variant="heading" />
      <Skeleton variant="text" />
    </div>

    {/* Stats */}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
      {Array(4).fill().map((_, i) => (
        <div key={i} className="p-6 rounded-xl bg-gray-50 dark:bg-gray-900/50 space-y-2">
          <Skeleton variant="text" className="w-16" />
          <Skeleton variant="heading" className="w-20" />
        </div>
      ))}
    </div>

    {/* Content cards */}
    <div className="grid md:grid-cols-2 gap-6">
      {Array(3).fill().map((_, i) => (
        <div key={i} className="p-6 rounded-xl bg-gray-50 dark:bg-gray-900/50 space-y-4">
          <Skeleton variant="heading" />
          <Skeleton variant="text" />
          <Skeleton variant="text" />
          <Skeleton variant="image" className="w-32" />
        </div>
      ))}
    </div>
  </div>
);

export default PageSkeleton;
