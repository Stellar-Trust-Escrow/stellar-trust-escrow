/**
 * Formats a Date (or timestamp) as a human-readable relative string.
 * e.g. "just now", "2 minutes ago", "3 hours ago"
 *
 * @param {Date|number|null} date
 * @returns {string}
 */
export function formatRelativeTime(date) {
  if (!date) return '';

  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);

  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds} seconds ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}
