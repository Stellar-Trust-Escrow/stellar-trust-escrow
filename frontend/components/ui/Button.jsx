/**
 * Button Component
 *
 * Reusable button with variant, size, loading, and disabled support.
 * Renders as a Next.js <Link> when `href` is provided (and not disabled).
 * Supports `asChild` to wrap an arbitrary child element with button styles.
 */
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { cn } from '../../lib/utils';

const sizeClasses = {
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-base gap-2',
};

/** Inline SVG spinner that inherits the current text colour. */
function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 shrink-0"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

/**
 * @param {object}  props
 * @param {'primary'|'secondary'|'danger'|'ghost'} [props.variant='primary']
 * @param {'sm'|'md'|'lg'} [props.size='md']
 * @param {boolean} [props.isLoading=false]  — shows spinner and disables the button
 * @param {boolean} [props.disabled=false]
 * @param {string}  [props.href]             — renders as a Next.js Link when set
 * @param {boolean} [props.asChild=false]    — wraps children with button styles instead
 * @param {string}  [props.className]
 */
export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  href,
  asChild = false,
  className,
  onClick,
  ...rest
}) {
  const isDisabled = disabled || isLoading;
  const [isHovered, setIsHovered] = useState(false);

  const getVariantStyles = () => {
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: isHovered ? 'var(--color-brand-hover)' : 'var(--color-brand)',
          color: 'white',
          borderColor: 'var(--color-brand)',
        };
      case 'secondary':
        return {
          backgroundColor: isHovered ? 'var(--color-bg-elevated)' : 'var(--color-bg-surface)',
          color: 'var(--color-text-primary)',
          borderColor: 'var(--color-border)',
        };
      case 'danger':
        return {
          backgroundColor: isHovered ? 'var(--color-danger-soft)' : 'transparent',
          color: 'var(--color-danger)',
          borderColor: 'var(--color-danger)',
        };
      case 'ghost':
        return {
          backgroundColor: isHovered ? 'var(--color-bg-elevated)' : 'transparent',
          color: 'var(--color-text-secondary)',
          borderColor: 'transparent',
        };
      default:
        return {
          backgroundColor: isHovered ? 'var(--color-brand-hover)' : 'var(--color-brand)',
          color: 'white',
          borderColor: 'var(--color-brand)',
        };
    }
  };

  const variantStyles = getVariantStyles();

  const baseClasses = cn(
    'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none',
    sizeClasses[size] ?? sizeClasses.md,
    isDisabled && 'opacity-50 cursor-not-allowed pointer-events-none',
    className,
  );

  const renderElement = (Element, props) => (
    <Element
      {...props}
      className={baseClasses}
      style={{
        ...variantStyles,
        borderWidth: '1px',
        borderStyle: 'solid',
        '--tw-ring-color': 'var(--color-brand)',
        '--tw-ring-offset-color': 'var(--color-bg-base)',
      }}
      onMouseEnter={() => !isDisabled && setIsHovered(true)}
      onMouseLeave={() => !isDisabled && setIsHovered(false)}
    />
  );

  // Render as a styled wrapper around an arbitrary child (e.g. <Link>)
  if (asChild && children) {
    const child = Array.isArray(children) ? children[0] : children;
    return (
      <span
        className={baseClasses}
        aria-disabled={isDisabled}
        style={{
          ...variantStyles,
          borderWidth: '1px',
          borderStyle: 'solid',
        }}
        onMouseEnter={() => !isDisabled && setIsHovered(true)}
        onMouseLeave={() => !isDisabled && setIsHovered(false)}
      >
        {child}
      </span>
    );
  }

  // Render as a Next.js Link when href is provided and not disabled
  if (href && !isDisabled) {
    return renderElement(Link, { href, ...rest, children });
  }

  return renderElement('button', {
    type: 'button',
    disabled: isDisabled,
    onClick: isDisabled ? undefined : onClick,
    'aria-busy': isLoading,
    ...rest,
    children: isLoading ? (
      <>
        <Spinner />
        <span>…</span>
      </>
    ) : (
      children
    ),
  });
}
