/**
 * EmptyState Component
 *
 * Displays a centered SVG illustration, a title, a supporting message,
 * and an optional call-to-action when a list or page has no content.
 *
 * @param {object}   props
 * @param {string}   [props.title='No escrows found']
 * @param {string}   [props.description]
 * @param {string}   [props.actionLabel]   — label for the CTA button
 * @param {string}   [props.actionHref]    — renders CTA as a link if provided
 * @param {Function} [props.onAction]      — renders CTA as a button if provided
 * @param {string}   [props.className]
 */

import Link from 'next/link';

export default function EmptyState({
  title = 'No escrows found',
  description,
  actionLabel,
  actionHref,
  onAction,
  className = '',
}) {
  const hasAction = actionLabel && (actionHref || onAction);

  return (
    <div
      className={`flex flex-col items-center justify-center py-20 text-center ${className}`}
      data-testid="empty-state"
    >
      {/* SVG illustration */}
      <svg
        aria-hidden="true"
        width="120"
        height="120"
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="mb-6 opacity-40"
      >
        {/* Outer circle */}
        <circle cx="60" cy="60" r="56" stroke="#4F46E5" strokeWidth="2" strokeDasharray="6 4" />

        {/* Document body */}
        <rect x="35" y="28" width="50" height="64" rx="5" fill="#1E1B4B" stroke="#4F46E5" strokeWidth="1.5" />

        {/* Document fold */}
        <path d="M70 28 L85 43" stroke="#4F46E5" strokeWidth="1.5" />
        <path d="M70 28 L70 43 L85 43" fill="#312E81" stroke="#4F46E5" strokeWidth="1.5" strokeLinejoin="round" />

        {/* Lines on document */}
        <rect x="43" y="52" width="34" height="3" rx="1.5" fill="#4F46E5" opacity="0.5" />
        <rect x="43" y="61" width="26" height="3" rx="1.5" fill="#4F46E5" opacity="0.4" />
        <rect x="43" y="70" width="30" height="3" rx="1.5" fill="#4F46E5" opacity="0.3" />

        {/* Magnifying glass */}
        <circle cx="78" cy="83" r="12" fill="#0F172A" stroke="#6366F1" strokeWidth="2" />
        <circle cx="78" cy="83" r="7" stroke="#818CF8" strokeWidth="1.5" />
        <line x1="83" y1="88" x2="90" y2="95" stroke="#818CF8" strokeWidth="2.5" strokeLinecap="round" />

        {/* X inside magnifying glass */}
        <line x1="75" y1="80" x2="81" y2="86" stroke="#6366F1" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="81" y1="80" x2="75" y2="86" stroke="#6366F1" strokeWidth="1.5" strokeLinecap="round" />
      </svg>

      {/* Title */}
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>

      {/* Supporting message */}
      {description && (
        <p className="text-sm text-gray-400 max-w-xs mb-6">{description}</p>
      )}

      {/* Call-to-action */}
      {hasAction && (
        actionHref ? (
          <Link
            href={actionHref}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600
                       hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
          >
            {actionLabel}
          </Link>
        ) : (
          <button
            onClick={onAction}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600
                       hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
          >
            {actionLabel}
          </button>
        )
      )}
    </div>
  );
}
