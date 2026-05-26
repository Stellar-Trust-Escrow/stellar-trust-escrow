import Skeleton from './Skeleton';

const DataTableSkeleton = ({ rows = 5, columns = 5 }) => (
  <div className="bg-white/50 dark:bg-gray-900/50 backdrop-blur border rounded-xl overflow-hidden">
    {/* Header */}
    <div className="grid gap-2 p-4 border-b bg-gray-50/50 dark:bg-gray-900/50">
      {Array(columns).fill().map((_, i) => (
        <Skeleton key={i} variant="heading" className="w-full" />
      ))}
    </div>
    {/* Rows */}
    <div className="divide-y">
      {Array(rows).fill().map((_, i) => (
        <div key={i} className="grid gap-4 p-4 items-center">
          <Skeleton variant="text" />
          <Skeleton variant="text" className="w-24" />
          <Skeleton variant="text" />
          <Skeleton variant="text" className="w-32" />
          <Skeleton variant="text" className="w-20" />
        </div>
      ))}
    </div>
  </div>
);

export default DataTableSkeleton;

