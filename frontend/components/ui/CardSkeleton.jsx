import Skeleton from './Skeleton';

const CardSkeleton = ({ className = '', ...props }) => (
  <div className={`card space-y-3 p-4 ${className}`} {...props}>
    <Skeleton variant="heading" className="w-3/4" />
    <div className="space-y-2">
      <Skeleton variant="text" />
      <Skeleton variant="text" className="w-5/6" />
    </div>
    <div className="flex justify-between pt-2">
      <Skeleton variant="text" className="w-20" />
      <Skeleton variant="text" className="w-24" />
    </div>
  </div>
);

export default CardSkeleton;
