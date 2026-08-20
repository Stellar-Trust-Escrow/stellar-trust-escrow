const STATUS_STYLES = {
  funded: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  in_progress: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  release_requested: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  released: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  disputed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  resolved: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  expired: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
};

export function StatusBadge({ status }) {
  const label = status?.replace(/_/g, ' ');
  const styles = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${styles}`}
    >
      {label}
    </span>
  );
}
