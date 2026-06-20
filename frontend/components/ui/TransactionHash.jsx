/**
 * TransactionHash Component
 *
 * Displays a transaction hash with copy button and link to block explorer.
 *
 * @param {object}   props
 * @param {string}   props.hash - Transaction hash
 * @param {string}   [props.explorerUrl] - URL to block explorer
 * @param {string}   [props.label='Transaction Hash'] - Display label
 */

'use client';

import CopyButton from './CopyButton';

export default function TransactionHash({ hash, explorerUrl, label = 'Transaction Hash' }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
        <p className="text-white font-mono text-sm break-all">{hash || '—'}</p>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <CopyButton text={hash} label="Copy" />
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium
                       bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 hover:text-indigo-300
                       border border-indigo-500/30 rounded-lg transition-colors"
            title="View on block explorer"
          >
            <span>🔗</span>
            <span>View</span>
          </a>
        )}
      </div>
    </div>
  );
}
