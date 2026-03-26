'use client';

/**
 * CurrencySelector
 *
 * Dropdown that lets users pick their preferred display currency.
 * Reads/writes via CurrencyContext — no props required.
 *
 * @param {object}  [props]
 * @param {'sm'|'md'} [props.size='md']
 * @param {string}  [props.className]
 */

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { useCurrency, SUPPORTED_CURRENCIES } from '../../contexts/CurrencyContext.jsx';

export default function CurrencySelector({ size = 'md', className = '' }) {
  const { currency, setCurrency, ratesLoading } = useCurrency();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = SUPPORTED_CURRENCIES.find((c) => c.code === currency) ?? SUPPORTED_CURRENCIES[0];

  const sizeClasses = size === 'sm'
    ? 'text-xs px-2 py-1 gap-1'
    : 'text-sm px-3 py-2 gap-1.5';

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Currency: ${current.name}`}
        className={`flex items-center ${sizeClasses} rounded-lg border border-gray-700
          bg-gray-900 text-gray-300 hover:text-white hover:border-gray-600
          transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500`}
      >
        <span className="font-medium">{current.code}</span>
        <span className="text-gray-500">{current.symbol}</span>
        {ratesLoading && (
          <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" title="Loading rates" />
        )}
        <ChevronDown
          size={12}
          className={`text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Select currency"
          className="absolute right-0 mt-1 w-52 bg-gray-900 border border-gray-700 rounded-lg
            shadow-xl z-50 py-1 max-h-72 overflow-y-auto"
        >
          {SUPPORTED_CURRENCIES.map((c) => (
            <li key={c.code} role="option" aria-selected={c.code === currency}>
              <button
                onClick={() => { setCurrency(c.code); setOpen(false); }}
                className={`w-full flex items-center justify-between px-3 py-2 text-sm
                  transition-colors hover:bg-gray-800
                  ${c.code === currency ? 'text-indigo-400' : 'text-gray-300 hover:text-white'}`}
              >
                <span className="flex items-center gap-2">
                  <span className="w-8 text-gray-500 font-mono text-xs">{c.symbol}</span>
                  <span>
                    <span className="font-medium">{c.code}</span>
                    <span className="text-gray-500 ml-1.5 text-xs">{c.name}</span>
                  </span>
                </span>
                {c.code === currency && <Check size={13} className="text-indigo-400 flex-shrink-0" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
