/** Matches a valid Stellar public (G-address): G + 55 Base32 chars (A-Z, 2-7). */
const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

/**
 * Returns true if the given string is a valid Stellar G-address.
 * Trims whitespace before checking so copy-paste errors are handled gracefully.
 *
 * @param {string} address
 * @returns {boolean}
 */
export function isValidStellarAddress(address) {
  if (typeof address !== 'string') return false;
  return STELLAR_ADDRESS_RE.test(address.trim());
}
