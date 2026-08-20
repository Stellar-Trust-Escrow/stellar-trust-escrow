'use client';

/**
 * Storybook mocks for the application's Wallet and Theme contexts.
 *
 * The production app reads wallet state from a Redux-style store
 * (`store/app-store.jsx`) and theme state from `contexts/ThemeContext.jsx`.
 * Those providers rely on `localStorage`, `document.cookie`, and the
 * `window.matchMedia` API, which makes them awkward and non-deterministic
 * inside Storybook.
 *
 * To keep stories hermetic and reproducible (and to give Chromatic stable
 * visual baselines) every story is wrapped in these mock providers via the
 * global decorator defined in `.storybook/preview.tsx`.
 *
 * The mock wallet shape intentionally mirrors the subset of fields consumed by
 * the shared UI components (see `components/ui/WalletStatus.jsx`), so any
 * component that reads `useWalletMock()` behaves identically to production.
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

// ── Wallet mock ───────────────────────────────────────────────────────────────

export type MockWalletStatus = 'disconnected' | 'connecting' | 'connected';
export type MockWalletType = 'freighter' | 'ledger' | 'alonimo' | null;

export interface MockWalletState {
  status: MockWalletStatus;
  isConnected: boolean;
  isConnecting: boolean;
  isFreighterInstalled: boolean;
  address: string | null;
  publicKey: string | null;
  type: MockWalletType;
  network: string;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
  switchWallet: (type: MockWalletType) => void;
}

export const MOCK_FREIGHTER_ADDRESS =
  'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWXYZ5678';

export const defaultMockWallet: MockWalletState = {
  status: 'disconnected',
  isConnected: false,
  isConnecting: false,
  isFreighterInstalled: true,
  address: null,
  publicKey: null,
  type: null,
  network: 'testnet',
  error: null,
  connect: () => {},
  disconnect: () => {},
  switchWallet: () => {},
};

export const WalletContext = createContext<MockWalletState>(defaultMockWallet);

/** Read the mock wallet state. Safe to call from any component rendered inside `WalletProviderMock`. */
export function useWalletMock(): MockWalletState {
  return useContext(WalletContext);
}

export interface WalletProviderMockProps {
  children: React.ReactNode;
  /** Partial override of the default mock wallet, e.g. `{ status: 'connected', address: 'G…' }`. */
  wallet?: Partial<MockWalletState>;
}

/** Provides a deterministic wallet context for stories. */
export function WalletProviderMock({ children, wallet }: WalletProviderMockProps) {
  const value = useMemo<MockWalletState>(() => ({ ...defaultMockWallet, ...wallet }), [wallet]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

/** Convenience builder so stories can describe wallet state declaratively. */
export function buildMockWallet(overrides: Partial<MockWalletState> = {}): MockWalletState {
  return { ...defaultMockWallet, ...overrides };
}

// ── Theme mock ────────────────────────────────────────────────────────────────

export type MockTheme = 'dark' | 'light';

export interface MockThemeState {
  theme: MockTheme;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<MockThemeState>({
  theme: 'dark',
  toggleTheme: () => {},
});

/** Read the mock theme state. Mirrors the public surface of the real `useTheme()`. */
export function useThemeMock(): MockThemeState {
  return useContext(ThemeContext);
}

export interface ThemeProviderMockProps {
  children: React.ReactNode;
  /** Initial theme applied to the document root. Defaults to `dark` to match the app. */
  theme?: MockTheme;
}

/**
 * Lightweight theme provider for Storybook.
 *
 * Unlike the production `ThemeProvider` (which reads `document.cookie` and
 * hides content until mounted to avoid a flash of unstyled content) this mock
 * simply toggles the `dark` class on `<html>` so Tailwind's dark: variants
 * render correctly and Chromatic snapshots are stable.
 */
export function ThemeProviderMock({ children, theme = 'dark' }: ThemeProviderMockProps) {
  const [current, setCurrent] = useState<MockTheme>(theme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', current === 'dark');
    root.setAttribute('data-theme', current);
  }, [current]);

  const value = useMemo<MockThemeState>(
    () => ({
      theme: current,
      toggleTheme: () => setCurrent((t) => (t === 'dark' ? 'light' : 'dark')),
    }),
    [current],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// ── Combined provider used by the global preview decorator ────────────────────

export interface StorybookProvidersProps {
  children: React.ReactNode;
  wallet?: Partial<MockWalletState>;
  theme?: MockTheme;
}

/**
 * Wraps stories in both the Wallet and Theme mocks. The preview applies this
 * decorator globally so every story renders with a consistent, dark-themed,
 * wallet-aware environment — exactly as required by the issue spec.
 */
export function StorybookProviders({ children, wallet, theme = 'dark' }: StorybookProvidersProps) {
  return (
    <ThemeProviderMock theme={theme}>
      <WalletProviderMock wallet={wallet}>{children}</WalletProviderMock>
    </ThemeProviderMock>
  );
}
