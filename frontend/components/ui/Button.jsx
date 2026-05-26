/**
 * Button Component
 *
 * Reusable button with variant, size, loading, and disabled support.
 * Renders as a Next.js <Link> when `href` is provided (and not disabled).
 * Supports `asChild` to wrap an arbitrary child element with button styles.
 */

import Link from 'next/link';
import { cn } from '../../lib/utils';

const variantClasses = {
  primary: 'bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500',
  secondary: 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700',
  danger: 'bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-800',
  ghost: 'bg-transparent hover:bg-gray-800 text-gray-400 border border-transparent',
};

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

  const classes = cn(
    'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
    variantClasses[variant] ?? variantClasses.primary,
    sizeClasses[size] ?? sizeClasses.md,
    isDisabled && 'opacity-50 cursor-not-allowed pointer-events-none',
    className,
  );

  // Render as a styled wrapper around an arbitrary child (e.g. <Link>)
  if (asChild && children) {
    const child = Array.isArray(children) ? children[0] : children;
    return (
      <span className={classes} aria-disabled={isDisabled}>
        {child}
      </span>
    );
  }

  // Render as a Next.js Link when href is provided and not disabled
  if (href && !isDisabled) {
    return (
      <Link href={href} className={classes} {...rest}>
        {children}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={classes}
      disabled={isDisabled}
      onClick={isDisabled ? undefined : onClick}
      aria-busy={isLoading}
      {...rest}
    >
      {isLoading ? (
        <>
          <Spinner />
          <span>…</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
