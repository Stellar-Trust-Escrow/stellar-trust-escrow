/**
 * Sentry User Context
 *
 * Call `setSentryUser(address)` after wallet connection so all subsequent
 * Sentry events are tagged with the user's (truncated) Stellar address.
 * Call `clearSentryUser()` on disconnect.
 *
 * We never send the full address — only a truncated form to avoid PII issues.
 */

import * as Sentry from '@sentry/nextjs';

/**
 * @param {string} address — full Stellar address (G...)
 */
export function setSentryUser(address) {
  if (!address) return;
  // Store only a truncated form: G...XXXX
  const truncated = `${address.slice(0, 4)}...${address.slice(-4)}`;
  Sentry.setUser({ id: truncated, username: truncated });
}

export function clearSentryUser() {
  Sentry.setUser(null);
}
