/**
 * ReputationBadge Component
 *
 * Displays a numerical reputation score with a color-coded ring and hover tooltip.
 *
 * @param {object} props
 * @param {number} props.score  — 0–1000+
 * @param {'sm'|'md'|'lg'} [props.size='md']
 *
 * TODO (contributor — easy, Issue #28):
 * - Color ring based on score tier (matches BADGE_THRESHOLDS in reputationService)
 * - Add animated ring fill (CSS conic-gradient) proportional to score
 */

'use client';

import Tooltip from './Tooltip';

export default function ReputationBadge({ score, size = 'md' }) {
  const color =
    score >= 500
      ? 'text-amber-400 ring-amber-400/30'
      : score >= 250
        ? 'text-purple-400 ring-purple-400/30'
        : score >= 100
          ? 'text-indigo-400 ring-indigo-400/30'
          : 'text-gray-400 ring-gray-600/30';

  const sizeClass =
    size === 'sm'
      ? 'w-10 h-10 text-sm'
      : size === 'lg'
        ? 'w-16 h-16 text-xl'
        : 'w-12 h-12 text-base';

  const getTier = (score) => {
    if (score >= 500) return 'Excellent';
    if (score >= 250) return 'Good';
    if (score >= 100) return 'Fair';
    return 'New';
  };

  const tooltipContent = `${getTier(score)} • Score: ${score}`;

  return (
    <Tooltip content={tooltipContent} position="top">
      <div
        className={`${sizeClass} ${color} rounded-full ring-2 flex items-center justify-center font-bold cursor-help`}
        aria-label={`Reputation: ${getTier(score)} (${score} points)`}
      >
        {score}
      </div>
    </Tooltip>
  );
}
