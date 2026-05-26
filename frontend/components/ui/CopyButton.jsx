/**
 * CopyButton Component
 *
 * Button that copies text to clipboard with visual feedback.
 *
 * @param {object}   props
 * @param {string}   props.text - Text to copy
 * @param {string}   [props.label='Copy'] - Button label
 * @param {number}   [props.feedbackDuration=2000] - How long to show "Copied!" feedback
 */

'use client';

import { useState } from 'react';

export default function CopyButton({ text, label = 'Copy', feedbackDuration = 2000 }) {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), feedbackDuration);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium
                 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white
                 border border-gray-700 rounded-lg transition-colors"
      title={isCopied ? 'Copied!' : `Copy ${label}`}
    >
      {isCopied ? (
        <>
          <span>✓</span>
          <span>Copied!</span>
        </>
      ) : (
        <>
          <span>📋</span>
          <span>{label}</span>
        </>
      )}
    </button>
  );
}
