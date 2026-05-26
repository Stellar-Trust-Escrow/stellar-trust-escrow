'use client';

/**
 * PageTransition
 *
 * Wraps page content with a fade-in animation on mount.
 * Uses CSS animation so it doesn't block navigation or cause layout shift.
 *
 * Usage: wrap any page's root element with <PageTransition>.
 */

export default function PageTransition({ children }) {
  return (
    <div className="animate-fade-in">
      {children}
    </div>
  );
}
