'use client';

/**
 * ProductTour — step-by-step interactive onboarding for StellarTrustEscrow.
 *
 * Features:
 * - 5 guided steps with glowing spotlight overlays on target elements
 * - Wallet connection check before proceeding past step 1
 * - Progress persisted in localStorage (key: "ste_tour_step")
 * - Skip / resume at any time
 * - Fully keyboard-navigable; focus trapped inside tooltip
 * - Responsive: works on mobile, tablet, and desktop
 *
 * Usage:
 *   <ProductTour />          — auto-shows on first visit
 *   <ProductTour force />    — always show (e.g. from Help menu)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'ste_tour_step';
const TOTAL_STEPS = 5;

const STEPS = [
  {
    id: 'connect-wallet',
    target: '[data-tour="connect-wallet"]',
    title: 'Connect Your Wallet',
    body: 'Click "Connect Wallet" to link your Freighter browser extension. This is your identity on the Stellar network — no account creation needed.',
    requiresWallet: false,
    placement: 'bottom',
  },
  {
    id: 'get-testnet-xlm',
    target: '[data-tour="get-testnet-xlm"]',
    title: 'Get Testnet XLM',
    body: 'Need funds to experiment? Use the Stellar Friendbot to fund your testnet wallet with free XLM. Click the faucet button in the top bar.',
    requiresWallet: true,
    placement: 'bottom',
  },
  {
    id: 'define-milestones',
    target: '[data-tour="create-escrow"]',
    title: 'Define Milestones',
    body: 'Break your project into milestones — each with a title, description, and payment amount. Funds are only released when you approve each milestone.',
    requiresWallet: true,
    placement: 'right',
  },
  {
    id: 'fund-escrow',
    target: '[data-tour="create-escrow"]',
    title: 'Fund the Escrow',
    body: 'Lock your USDC or XLM into the smart contract. Funds are held securely on-chain and can only be released by milestone approval or dispute resolution.',
    requiresWallet: true,
    placement: 'right',
  },
  {
    id: 'disputes',
    target: '[data-tour="disputes"]',
    title: 'Handling Disputes',
    body: 'If something goes wrong, either party can raise a dispute. An arbiter reviews the evidence and splits the funds fairly — or the oracle fallback kicks in after the grace period.',
    requiresWallet: false,
    placement: 'top',
  },
];

// ── Spotlight overlay ─────────────────────────────────────────────────────────

function Spotlight({ rect }) {
  if (!rect) return null;
  const pad = 8;
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-[9998] pointer-events-none"
      style={{
        background: `radial-gradient(ellipse ${rect.width + pad * 2}px ${rect.height + pad * 2}px at ${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px, transparent 0%, rgba(0,0,0,0.75) 100%)`,
      }}
    >
      {/* Glowing ring around target */}
      <div
        className="absolute rounded-lg"
        style={{
          left: rect.left - pad,
          top: rect.top - pad,
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
          boxShadow: '0 0 0 3px #6366f1, 0 0 24px 6px rgba(99,102,241,0.5)',
          animation: 'ste-pulse 2s ease-in-out infinite',
        }}
      />
    </div>
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function Tooltip({ step, stepIndex, rect, onNext, onPrev, onSkip, walletConnected }) {
  const tooltipRef = useRef(null);
  const closeRef = useRef(null);
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TOTAL_STEPS - 1;
  const blocked = step.requiresWallet && !walletConnected;

  // Position tooltip relative to target rect
  const pos = useTooltipPosition(rect, step.placement);

  // Trap focus inside tooltip
  useEffect(() => {
    const el = tooltipRef.current;
    if (!el) return;
    const focusable = el.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first?.focus();

    const trap = (e) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    el.addEventListener('keydown', trap);
    return () => el.removeEventListener('keydown', trap);
  }, [stepIndex]);

  // Escape to skip
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onSkip();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onSkip]);

  return createPortal(
    <div
      ref={tooltipRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
      aria-describedby="tour-body"
      className="fixed z-[9999] w-80 max-w-[calc(100vw-2rem)] bg-gray-900 border border-indigo-500/50 rounded-xl shadow-2xl p-5"
      style={pos}
    >
      {/* Progress dots */}
      <div
        role="status"
        className="flex gap-1.5 mb-4"
        aria-label={`Step ${stepIndex + 1} of ${TOTAL_STEPS}`}
      >
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i < stepIndex
                ? 'bg-indigo-400 w-4'
                : i === stepIndex
                  ? 'bg-indigo-500 w-6'
                  : 'bg-gray-700 w-4'
            }`}
          />
        ))}
      </div>

      {/* Content */}
      <h2 id="tour-title" className="text-base font-bold text-white mb-2">
        {step.title}
      </h2>
      <p id="tour-body" className="text-sm text-gray-300 leading-relaxed mb-4">
        {step.body}
      </p>

      {/* Wallet gate warning */}
      {blocked && (
        <p
          role="alert"
          className="text-xs text-yellow-400 bg-yellow-400/10 rounded-lg px-3 py-2 mb-4"
        >
          ⚠️ Connect your wallet to continue.
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onSkip}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 rounded px-1"
        >
          Skip tour
        </button>
        <div className="flex gap-2">
          {!isFirst && (
            <button
              onClick={onPrev}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-600 text-gray-300 hover:border-gray-400 transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Back
            </button>
          )}
          <button
            ref={isLast ? closeRef : undefined}
            onClick={blocked ? undefined : onNext}
            disabled={blocked}
            aria-disabled={blocked}
            className="px-4 py-1.5 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-colors focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            {isLast ? 'Finish' : 'Next →'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Position helper ───────────────────────────────────────────────────────────

function useTooltipPosition(rect, placement) {
  if (!rect) {
    // Centered fallback when target not found
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    };
  }

  const gap = 16;
  const tooltipW = 320;
  const tooltipH = 240; // approximate

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top, left;

  switch (placement) {
    case 'bottom':
      top = rect.bottom + gap;
      left = rect.left + rect.width / 2 - tooltipW / 2;
      break;
    case 'top':
      top = rect.top - tooltipH - gap;
      left = rect.left + rect.width / 2 - tooltipW / 2;
      break;
    case 'right':
      top = rect.top + rect.height / 2 - tooltipH / 2;
      left = rect.right + gap;
      break;
    case 'left':
      top = rect.top + rect.height / 2 - tooltipH / 2;
      left = rect.left - tooltipW - gap;
      break;
    default:
      top = rect.bottom + gap;
      left = rect.left;
  }

  // Clamp to viewport
  left = Math.max(8, Math.min(left, vw - tooltipW - 8));
  top = Math.max(8, Math.min(top, vh - tooltipH - 8));

  return { top, left };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ProductTour({ force = false }) {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const [walletConnected, setWalletConnected] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Only render portal after mount (SSR safety)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Check wallet connection
  useEffect(() => {
    const checkWallet = async () => {
      try {
        if (typeof window !== 'undefined' && window.freighter) {
          const connected = await window.freighter.isConnected();
          setWalletConnected(!!connected);
        }
      } catch {
        setWalletConnected(false);
      }
    };
    checkWallet();
    window.addEventListener('freighter:connected', () => setWalletConnected(true));
    return () => window.removeEventListener('freighter:connected', () => {});
  }, []);

  // Decide whether to show on mount
  useEffect(() => {
    if (!mounted) return;
    if (force) {
      setActive(true);
      return;
    }
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null) {
      // First visit
      setActive(true);
      setStepIndex(0);
    } else if (saved !== 'done') {
      const idx = parseInt(saved, 10);
      if (!isNaN(idx) && idx < TOTAL_STEPS) {
        setActive(true);
        setStepIndex(idx);
      }
    }
  }, [mounted, force]);

  // Measure target element rect whenever step changes
  useEffect(() => {
    if (!active) return;
    const step = STEPS[stepIndex];
    const measure = () => {
      const el = document.querySelector(step.target);
      if (el) {
        setTargetRect(el.getBoundingClientRect());
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        setTargetRect(null);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [active, stepIndex]);

  const saveProgress = useCallback((idx) => {
    localStorage.setItem(STORAGE_KEY, String(idx));
  }, []);

  const handleNext = useCallback(() => {
    if (stepIndex < TOTAL_STEPS - 1) {
      const next = stepIndex + 1;
      setStepIndex(next);
      saveProgress(next);
    } else {
      // Tour complete
      localStorage.setItem(STORAGE_KEY, 'done');
      setActive(false);
    }
  }, [stepIndex, saveProgress]);

  const handlePrev = useCallback(() => {
    if (stepIndex > 0) {
      const prev = stepIndex - 1;
      setStepIndex(prev);
      saveProgress(prev);
    }
  }, [stepIndex, saveProgress]);

  const handleSkip = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'done');
    setActive(false);
  }, []);

  if (!mounted || !active) return null;

  const step = STEPS[stepIndex];

  return (
    <>
      {/* Inject keyframe animation once */}
      <style>{`
        @keyframes ste-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>

      <Spotlight rect={targetRect} />
      <Tooltip
        step={step}
        stepIndex={stepIndex}
        rect={targetRect}
        onNext={handleNext}
        onPrev={handlePrev}
        onSkip={handleSkip}
        walletConnected={walletConnected}
      />
    </>
  );
}

// ── Convenience hook for programmatic control ─────────────────────────────────

/**
 * useProductTour — reset and restart the tour from any component.
 *
 * @example
 *   const { restart } = useProductTour();
 *   <button onClick={restart}>Take the tour</button>
 */
export function useProductTour() {
  const restart = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload(); // simplest way to re-trigger the auto-show logic
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { restart, reset };
}
