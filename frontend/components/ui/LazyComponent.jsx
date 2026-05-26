/**
 * LazyComponent — Generic Lazy-Loading Wrapper
 *
 * Renders a placeholder until the component scrolls into the viewport,
 * then mounts the children. Uses IntersectionObserver for efficiency.
 *
 * @param {object}  props
 * @param {React.ReactNode}  props.children        — content to lazy-load
 * @param {React.ReactNode}  [props.fallback]      — placeholder shown before load
 * @param {string}           [props.rootMargin]     — how early to trigger (default 200px)
 * @param {string}           [props.className]      — wrapper className
 * @param {string}           [props.minHeight]      — min-height to prevent CLS
 *
 * Usage:
 *   <LazyComponent fallback={<Skeleton />} minHeight="300px">
 *     <HeavyChart data={data} />
 *   </LazyComponent>
 */

'use client';

import { useIntersectionObserver } from '../../hooks/useIntersectionObserver';

export default function LazyComponent({
  children,
  fallback = null,
  rootMargin = '200px',
  className = '',
  minHeight = '0',
}) {
  const { ref, isIntersecting } = useIntersectionObserver({
    rootMargin,
    triggerOnce: true,
  });

  return (
    <div
      ref={ref}
      className={className}
      style={{ minHeight: isIntersecting ? undefined : minHeight }}
    >
      {isIntersecting ? children : fallback}
    </div>
  );
}
