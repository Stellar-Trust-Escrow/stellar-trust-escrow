/**
 * OptimizedImage — Performance-Optimized Image Component
 *
 * Wraps Next.js Image with lazy loading via IntersectionObserver,
 * blur-up placeholder, and automatic format negotiation (avif/webp).
 *
 * For external images, falls back to a native <img> with loading="lazy".
 *
 * @param {object}  props
 * @param {string}  props.src           — image source URL
 * @param {string}  props.alt           — accessible alt text (required)
 * @param {number}  [props.width]       — intrinsic width
 * @param {number}  [props.height]      — intrinsic height
 * @param {boolean} [props.fill]        — fill parent container
 * @param {boolean} [props.priority]    — above-the-fold (skip lazy)
 * @param {string}  [props.sizes]       — responsive sizes hint
 * @param {string}  [props.className]
 * @param {'blur'|'empty'|'none'} [props.placeholder='blur']
 *
 * Usage:
 *   <OptimizedImage src="/hero.png" alt="Hero" width={1200} height={600} priority />
 *   <OptimizedImage src="/avatar.jpg" alt="User" width={48} height={48} />
 */

'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useIntersectionObserver } from '../../hooks/useIntersectionObserver';

// Tiny 1×1 transparent SVG used as blur placeholder
const BLUR_PLACEHOLDER =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMxZjI5MzciLz48L3N2Zz4=';

export default function OptimizedImage({
  src,
  alt,
  width,
  height,
  fill = false,
  priority = false,
  sizes,
  className = '',
  placeholder = 'blur',
  ...rest
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Skip intersection observer for priority (above-the-fold) images
  const { ref, isIntersecting } = useIntersectionObserver({
    rootMargin: '400px',
    triggerOnce: true,
  });

  const shouldRender = priority || isIntersecting;

  // Default responsive sizes if not specified
  const defaultSizes = sizes || '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw';

  // Error fallback
  if (hasError) {
    return (
      <div
        className={`bg-gray-800 flex items-center justify-center text-gray-600 text-xs ${className}`}
        style={{ width: width || '100%', height: height || 200 }}
        role="img"
        aria-label={alt}
      >
        ⚠️ Image unavailable
      </div>
    );
  }

  return (
    <div
      ref={priority ? undefined : ref}
      className={`relative overflow-hidden ${className}`}
      style={{
        width: fill ? '100%' : width,
        height: fill ? '100%' : height,
      }}
    >
      {shouldRender ? (
        <Image
          src={src}
          alt={alt}
          width={fill ? undefined : width}
          height={fill ? undefined : height}
          fill={fill}
          sizes={defaultSizes}
          priority={priority}
          quality={80}
          placeholder={placeholder === 'blur' ? 'blur' : 'empty'}
          blurDataURL={placeholder === 'blur' ? BLUR_PLACEHOLDER : undefined}
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          className={`transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
          {...rest}
        />
      ) : (
        // Placeholder skeleton while waiting for intersection
        <div
          className="animate-pulse bg-gray-800 rounded"
          style={{ width: '100%', height: '100%', minHeight: height || 200 }}
        />
      )}
    </div>
  );
}
