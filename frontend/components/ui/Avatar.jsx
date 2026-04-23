/**
 * Avatar Component
 *
 * Renders a profile image with an automatic initials fallback when the
 * image is missing or fails to load.
 *
 * Initials are derived from the wallet address (chars 1–2, uppercased).
 *
 * Props:
 *   src        — image URL (optional)
 *   address    — Stellar wallet address used to generate initials
 *   size       — Tailwind size token: 'sm' (8), 'md' (10), 'lg' (16) — default 'md'
 *   className  — extra classes on the root element
 *   alt        — img alt text (default "Avatar")
 */

'use client';

import { useState } from 'react';

const SIZE = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-16 h-16 text-xl',
};

function getInitials(address) {
  if (!address) return '?';
  return address.replace(/^G/, '').slice(0, 2).toUpperCase();
}

export default function Avatar({ src, address = '', size = 'md', className = '', alt = 'Avatar' }) {
  const [imgFailed, setImgFailed] = useState(false);
  const sizeClass = SIZE[size] ?? SIZE.md;
  const base = `rounded-2xl flex-shrink-0 ${sizeClass} ${className}`;

  if (src && !imgFailed) {
    return (
      <img
        src={src}
        alt={alt}
        className={`${base} object-cover`}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <div
      className={`${base} bg-indigo-600/30 flex items-center justify-center text-indigo-400 font-bold`}
      aria-label={alt}
    >
      {getInitials(address)}
    </div>
  );
}
