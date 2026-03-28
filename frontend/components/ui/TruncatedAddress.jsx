'use client';

/**
 * TruncatedAddress
 *
 * Renders a Stellar address in truncated form (first 6 + last 4 chars).
 * Clicking copies the full address to the clipboard with visual feedback.
 *
 * @param {object}  props
 * @param {string}  props.address   - Full Stellar public key
 * @param {string}  [props.className]
 */

import { useState } from 'react';
import { truncateAddress } from '../../lib/truncateAddress';

export default function TruncatedAddress({ address, className = '' }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? 'Copied!' : address}
      aria-label={`Copy address ${address}`}
      className={`font-mono text-sm hover:text-indigo-300 focus-visible:outline-none
                  focus-visible:ring-1 focus-visible:ring-indigo-500 rounded
                  transition-colors cursor-pointer ${copied ? 'text-emerald-400' : 'text-indigo-400'} ${className}`}
    >
      {copied ? '✓ Copied' : truncateAddress(address)}
    </button>
  );
}
