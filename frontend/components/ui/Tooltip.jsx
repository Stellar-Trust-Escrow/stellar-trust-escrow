/**
 * Tooltip Component
 *
 * Simple tooltip that appears on hover/focus above the trigger element.
 *
 * @param {object}   props
 * @param {React.ReactNode} props.children - Trigger element
 * @param {string}   props.content - Tooltip content
 * @param {string}   [props.position='top'] - Tooltip position
 */

'use client';

import { useState } from 'react';

export default function Tooltip({ children, content, position = 'top' }) {
  const [isVisible, setIsVisible] = useState(false);

  const positionClasses = {
    top: 'bottom-full mb-2',
    bottom: 'top-full mt-2',
    left: 'right-full mr-2',
    right: 'left-full ml-2',
  };

  return (
    <div className="relative inline-block group">
      <div
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
        tabIndex={0}
        role="button"
      >
        {children}
      </div>

      <div
        className={`absolute ${positionClasses[position]} left-1/2 -translate-x-1/2 z-50
                     bg-gray-800 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap
                     border border-gray-700 shadow-lg pointer-events-none
                     ${isVisible ? 'opacity-100' : 'opacity-0 invisible'} transition-opacity`}
        role="tooltip"
        aria-hidden={!isVisible}
      >
        {content}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
      </div>
    </div>
  );
}
