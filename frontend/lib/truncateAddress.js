/**
 * truncateAddress
 *
 * Shortens a Stellar address to "GABCDE…XY12" format (first 6 + last 4 chars).
 *
 * @param {string} address - Full Stellar public key
 * @param {number} [start=6] - Characters to keep from the start
 * @param {number} [end=4]   - Characters to keep from the end
 * @returns {string}
 */
export function truncateAddress(address, start = 6, end = 4) {
  if (!address || address.length <= start + end) return address ?? '';
  return `${address.slice(0, start)}…${address.slice(-end)}`;
}
