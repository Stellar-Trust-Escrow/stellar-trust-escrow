'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

const STORAGE_KEY = 'ste_tutorial_completed';
const STEPS = [
  {
    id: 'welcome',
    target: null,
    title: 'Welcome to Stellar Escrow',
    body: 'Escrow holds funds safely until work is complete. You control when payments happen.',
  },
  {
    id: 'wallet',
    target: '[data-tutorial="wallet-connect"]',
    title: 'Connect Your Wallet',
    body: 'Link your Freighter wallet to start managing escrows.',
  },
  {
    id: 'dashboard',
    target: '[data-tutorial="dashboard"]',
    title: 'View Your Dashboard',
    body: 'Track all your escrows, disputes, and reputation in one place.',
  },
  {
    id: 'create',
    target: '[data-tutorial="create-escrow-btn"]',
    title: 'Create Your First Escrow',
    body: 'Click here to set up a new milestone-based escrow agreement.',
  },
];

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
      <div
        className="absolute rounded-lg"
        style={{
          left: rect.left - pad,
          top: rect.top - pad,
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
          boxShadow: '0 0 0 3px #6366f1, 0 0 24px 6px rgba(99,102,241,0.5)',
          animation: 'ste-tutorial-pulse 2s ease-in-out infinite',
        }}
      />
    </div>
  );
}

function Tooltip({ step, stepIndex, rect, onNext, onSkip, total }) {
  const tooltipRef = useRef(null);
  const isLast = stepIndex === total - 1;

  const pos = rect
    ? {
        top: (rect.bottom || rect.top) + 16,
        left: Math.max(8, (rect.left || 0) + ((rect.width || 0) / 2) - 160),
      }
    : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

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
      className="fixed z-[9999] w-80 bg-gray-900 border border-indigo-500/50 rounded-xl shadow-2xl p-5"
      style={pos}
    >
      <div className="flex gap-1.5 mb-4">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === stepIndex ? 'bg-indigo-500 w-6' : 'bg-gray-700 w-4'
            }`}
          />
        ))}
      </div>
      <h2 className="text-base font-bold text-white mb-2">{step.title}</h2>
      <p className="text-sm text-gray-300 leading-relaxed mb-4">{step.body}</p>
      <div className="flex justify-between gap-2">
        <button
          onClick={onSkip}
          className="text-xs text-gray-500 hover:text-gray-300 focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          Skip
        </button>
        <button
          onClick={onNext}
          className="px-4 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg focus-visible:ring-2 focus-visible:ring-indigo-400"
        >
          {isLast ? 'Finish' : 'Next →'}
        </button>
      </div>
    </div>,
    document.body,
  );
}

export default function OnboardingTutorial({ force = false }) {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (force) {
      setActive(true);
      return;
    }
    const completed = localStorage.getItem(STORAGE_KEY);
    if (!completed) {
      setActive(true);
    }
  }, [mounted, force]);

  useEffect(() => {
    if (!active) return;
    const step = STEPS[stepIndex];
    const measure = () => {
      if (step.target) {
        const el = document.querySelector(step.target);
        if (el) {
          setTargetRect(el.getBoundingClientRect());
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [active, stepIndex]);

  const handleNext = useCallback(() => {
    if (stepIndex < STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      localStorage.setItem(STORAGE_KEY, 'true');
      setActive(false);
    }
  }, [stepIndex]);

  const handleSkip = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setActive(false);
  }, []);

  if (!mounted || !active) return null;

  const step = STEPS[stepIndex];

  return (
    <>
      <style>{`
        @keyframes ste-tutorial-pulse {
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
        onSkip={handleSkip}
        total={STEPS.length}
      />
    </>
  );
}

export function useOnboardingTutorial() {
  const restart = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  }, []);

  return { restart };
}
