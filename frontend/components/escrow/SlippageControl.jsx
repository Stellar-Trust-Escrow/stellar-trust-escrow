'use client';

/**
 * SlippageControl Component — Issue #236
 *
 * Allows users to set a slippage tolerance percentage for multi-asset
 * path-payment escrows on Stellar. Shows safe defaults, validates
 * bounds, and explains the estimated output before submission.
 *
 * Features:
 *  - Preset buttons (0.1%, 0.5%, 1.0%) and custom numeric input
 *  - Validation: must be > 0 and <= 50 (%)
 *  - Estimated minimum output calculated from `sendAmount` and slippage
 *  - Warning banner when slippage is above a "high" threshold (3%)
 *  - Accessible — error messages linked via aria-describedby
 *
 * @param {object}    props
 * @param {number}    props.sendAmount          — amount being sent (source asset)
 * @param {string}    [props.receiveAsset='USDC'] — target asset ticker
 * @param {number}    [props.estimatedRate=1]   — exchange rate: 1 source → N receive
 * @param {number}    [props.value=0.5]         — controlled slippage % value
 * @param {Function}  props.onChange            — called with new slippage number on change
 */

import { useState, useId } from 'react';
import { AlertTriangle, Info } from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────

const PRESETS = [0.1, 0.5, 1.0];
const MIN_SLIPPAGE = 0.01;
const MAX_SLIPPAGE = 50;
const HIGH_SLIPPAGE_THRESHOLD = 3;
const DEFAULT_SLIPPAGE = 0.5;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Calculate the minimum received amount after slippage.
 * minReceive = sendAmount * rate * (1 - slippage/100)
 */
function calcMinReceive(sendAmount, rate, slippagePct) {
  if (!sendAmount || !rate || isNaN(sendAmount) || isNaN(rate)) return null;
  const gross = Number(sendAmount) * Number(rate);
  const min = gross * (1 - slippagePct / 100);
  return min > 0 ? min : null;
}

function formatAmount(value, decimals = 6) {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

/** Returns a validation error string or null */
function validate(raw) {
  const n = parseFloat(raw);
  if (raw === '' || isNaN(n)) return 'Slippage tolerance is required.';
  if (n < MIN_SLIPPAGE) return `Minimum slippage is ${MIN_SLIPPAGE}%.`;
  if (n > MAX_SLIPPAGE) return `Maximum slippage is ${MAX_SLIPPAGE}%.`;
  return null;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function SlippageControl({
  sendAmount = 0,
  receiveAsset = 'USDC',
  estimatedRate = 1,
  value,
  onChange,
}) {
  const [internalValue, setInternalValue] = useState(DEFAULT_SLIPPAGE);
  const [customInput, setCustomInput] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [touched, setTouched] = useState(false);

  const uid = useId();
  const inputId = `slippage-input-${uid}`;
  const errorId = `slippage-error-${uid}`;
  const descId = `slippage-desc-${uid}`;

  // Use controlled value when provided, otherwise internal state
  const slippage = value !== undefined ? value : internalValue;

  const rawInput = isCustom ? customInput : String(slippage);
  const validationError = touched ? validate(rawInput) : null;
  const isHigh = !validationError && slippage >= HIGH_SLIPPAGE_THRESHOLD;

  const minReceive = validationError
    ? null
    : calcMinReceive(sendAmount, estimatedRate, slippage);

  const handlePresetClick = (preset) => {
    setIsCustom(false);
    setCustomInput('');
    setTouched(true);
    if (onChange) onChange(preset);
    setInternalValue(preset);
  };

  const handleCustomChange = (e) => {
    const raw = e.target.value;
    setCustomInput(raw);
    setIsCustom(true);
    setTouched(true);
    const n = parseFloat(raw);
    if (!isNaN(n) && n >= MIN_SLIPPAGE && n <= MAX_SLIPPAGE) {
      if (onChange) onChange(n);
      setInternalValue(n);
    }
  };

  const handleCustomBlur = () => {
    setTouched(true);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      data-testid="slippage-control"
      className="space-y-3"
      role="group"
      aria-labelledby="slippage-group-label"
    >
      {/* Heading */}
      <div className="flex items-center gap-1.5">
        <label
          id="slippage-group-label"
          className="text-sm font-medium text-gray-300"
          htmlFor={inputId}
        >
          Slippage Tolerance
        </label>
        <span
          title="Maximum price movement you will accept. Higher values may result in worse rates but improve fill likelihood."
          aria-label="Slippage tolerance help text"
          className="text-gray-500 cursor-help"
        >
          <Info size={13} />
        </span>
      </div>

      {/* Preset buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => handlePresetClick(preset)}
            aria-pressed={!isCustom && slippage === preset}
            data-testid={`preset-${preset}`}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              !isCustom && slippage === preset
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-indigo-500 hover:text-gray-200'
            }`}
          >
            {preset}%
          </button>
        ))}

        {/* Custom input */}
        <div className="flex items-center gap-1">
          <input
            id={inputId}
            type="number"
            step="0.01"
            min={MIN_SLIPPAGE}
            max={MAX_SLIPPAGE}
            value={isCustom ? customInput : ''}
            onChange={handleCustomChange}
            onFocus={() => setIsCustom(true)}
            onBlur={handleCustomBlur}
            placeholder="Custom"
            aria-label="Custom slippage percentage"
            aria-describedby={`${descId}${validationError ? ` ${errorId}` : ''}`}
            aria-invalid={!!validationError}
            data-testid="slippage-custom-input"
            className={`w-24 px-2.5 py-1.5 rounded-lg text-xs border bg-gray-800 text-white placeholder-gray-600 focus:outline-none transition-colors ${
              validationError
                ? 'border-red-500 focus:border-red-400'
                : isCustom
                ? 'border-indigo-500'
                : 'border-gray-700 focus:border-indigo-500'
            }`}
          />
          <span className="text-xs text-gray-500">%</span>
        </div>
      </div>

      {/* Validation error */}
      {validationError && (
        <p
          id={errorId}
          role="alert"
          data-testid="slippage-error"
          className="text-xs text-red-400"
        >
          {validationError}
        </p>
      )}

      {/* High slippage warning */}
      {isHigh && (
        <div
          role="alert"
          data-testid="high-slippage-warning"
          className="flex items-start gap-2 bg-amber-900/20 border border-amber-500/40 rounded px-3 py-2 text-xs text-amber-300"
        >
          <AlertTriangle size={13} className="shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            High slippage tolerance ({slippage}%). Your transaction may execute at a significantly
            worse rate than quoted.
          </span>
        </div>
      )}

      {/* Estimated output */}
      <div
        id={descId}
        data-testid="estimated-output"
        className="bg-gray-800/60 rounded-lg px-3 py-2 text-xs text-gray-400 space-y-0.5"
        aria-live="polite"
      >
        <p>
          Estimated minimum received:{' '}
          <span className="text-white font-semibold" data-testid="min-receive-value">
            {minReceive !== null ? `${formatAmount(minReceive)} ${receiveAsset}` : '—'}
          </span>
        </p>
        {!validationError && sendAmount > 0 && (
          <p className="text-gray-500">
            Worst-case output at {slippage}% slippage from {formatAmount(sendAmount)} sent.
          </p>
        )}
      </div>
    </div>
  );
}
