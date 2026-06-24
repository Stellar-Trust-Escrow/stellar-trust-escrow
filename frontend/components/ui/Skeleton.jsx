import { clsx } from 'clsx';

const Skeleton = ({ className, variant = 'text', ...props }) => {
  const base = 'animate-shimmer rounded';

  const variants = {
    text: 'h-4 w-[60%]',
    heading: 'h-6 w-[70%] rounded-lg mb-2',
    card: 'h-32 rounded-xl',
    image: 'h-48 w-full rounded-xl',
    line: 'h-px',
    table: 'h-10',
  };

  return <div className={clsx(base, variants[variant], className)} aria-hidden="true" {...props} />;
};

export default Skeleton;
