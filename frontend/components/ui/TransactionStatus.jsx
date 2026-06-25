'use client';

import { useEffect, useRef } from 'react';

function useReducedMotion() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function CheckIcon({ animated }) {
  return (
    <svg
      viewBox="0 0 52 52"
      className="w-16 h-16"
      aria-hidden="true"
    >
      <circle
        cx="26"
        cy="26"
        r="25"
        fill="none"
        stroke="#22c55e"
        strokeWidth="2"
        className={animated ? 'tx-circle-draw' : ''}
        style={
          animated
            ? undefined
            : { strokeDasharray: '166', strokeDashoffset: '0' }
        }
      />
      <path
        fill="none"
        stroke="#22c55e"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14 27 l8 8 l16 -16"
        className={animated ? 'tx-check-draw' : ''}
        style={
          animated
            ? undefined
            : { strokeDasharray: '48', strokeDashoffset: '0' }
        }
      />
    </svg>
  );
}

function CrossIcon({ animated }) {
  return (
    <svg
      viewBox="0 0 52 52"
      className="w-16 h-16"
      aria-hidden="true"
    >
      <circle
        cx="26"
        cy="26"
        r="25"
        fill="none"
        stroke="#ef4444"
        strokeWidth="2"
        className={animated ? 'tx-circle-draw' : ''}
        style={
          animated
            ? undefined
            : { strokeDasharray: '166', strokeDashoffset: '0' }
        }
      />
      <path
        fill="none"
        stroke="#ef4444"
        strokeWidth="3"
        strokeLinecap="round"
        d="M16 16 L36 36 M36 16 L16 36"
        className={animated ? 'tx-cross-draw' : ''}
        style={
          animated
            ? undefined
            : { strokeDasharray: '60', strokeDashoffset: '0' }
        }
      />
    </svg>
  );
}

/**
 * TransactionStatus
 *
 * Displays a success or failure animation after a blockchain transaction.
 * Respects prefers-reduced-motion — static icon shown when motion is reduced.
 *
 * Props:
 *   status  — 'success' | 'failure'
 *   message — summary text shown after animation
 *   action  — { label, onClick } for the primary action button
 */
export default function TransactionStatus({ status, message, action }) {
  const reduced = useReducedMotion();
  const animated = !reduced;
  const isSuccess = status === 'success';

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center gap-6 py-8 px-4 text-center"
    >
      <style>{`
        @keyframes circle-draw {
          from { stroke-dashoffset: 166; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes check-draw {
          from { stroke-dashoffset: 48; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes cross-draw {
          from { stroke-dashoffset: 60; }
          to   { stroke-dashoffset: 0; }
        }
        .tx-circle-draw {
          stroke-dasharray: 166;
          stroke-dashoffset: 166;
          animation: circle-draw 0.6s ease-out forwards;
        }
        .tx-check-draw {
          stroke-dasharray: 48;
          stroke-dashoffset: 48;
          animation: check-draw 0.5s ease-out 0.6s forwards;
        }
        .tx-cross-draw {
          stroke-dasharray: 60;
          stroke-dashoffset: 60;
          animation: cross-draw 0.5s ease-out 0.6s forwards;
        }
      `}</style>

      {isSuccess ? (
        <CheckIcon animated={animated} />
      ) : (
        <CrossIcon animated={animated} />
      )}

      <p className={`text-lg font-medium ${isSuccess ? 'text-green-400' : 'text-red-400'}`}>
        {message}
      </p>

      {action && (
        <button
          onClick={action.onClick}
          className="mt-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
