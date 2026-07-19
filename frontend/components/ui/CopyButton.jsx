'use client';
import { useState } from 'react';

export function CopyButton({ text, value, label = 'Copy', feedbackDuration = 2000 }) {
  const [copied, setCopied] = useState(false);
  const textToCopy = text ?? value ?? '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), feedbackDuration);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const accessibleName = copied ? 'Copied!' : `Copy ${label}`;

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? 'Copied!' : `Copy ${label}`}
      aria-label={`Copy ${label ?? textToCopy}`}
      className="ml-1 rounded p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
    >
      {copied ? (
        <span className="text-green-500 text-xs font-medium">Copied!</span>
      ) : (
        <span className="text-xs font-medium">{label}</span>
      )}
    </button>
  );
}

export default CopyButton;
