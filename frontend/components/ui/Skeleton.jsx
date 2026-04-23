import { clsx } from 'clsx';

const Skeleton = ({ className, variant = 'text', ...props }) => {
  const base = 'animate-pulse bg-gray-200 dark:bg-gray-700';

  const variants = {
    text: 'h-4 w-[60%] rounded',
    heading: 'h-6 w-[70%] rounded-lg mb-2',
    card: 'h-32 rounded-xl',
    image: 'h-48 w-full rounded-xl',
    line: 'h-px bg-gray-300 dark:bg-gray-600',
    table: 'h-10 rounded',
  };

  return (
    <div
      className={clsx(base, variants[variant], className)}
      {...props}
    />
  );
};

export default Skeleton;
