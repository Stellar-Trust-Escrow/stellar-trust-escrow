import type { Preview } from '@storybook/react';
import React from 'react';

import '../app/globals.css';
import { StorybookProviders } from './mocks/WalletContextMock';

/**
 * Global Storybook preview.
 *
 * Every story is wrapped in the Wallet + Theme mocks (see
 * `.storybook/mocks/WalletContextMock.tsx`) so that shared components render
 * against a consistent, dark-themed, wallet-aware environment. The outer
 * container reproduces the app's dark background and default padding.
 */
const preview: Preview = {
  parameters: {
    // Dark background to match the app's dark theme
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: '#111827' }, // gray-900
        { name: 'darker', value: '#030712' }, // gray-950
        { name: 'light', value: '#ffffff' },
      ],
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
      expanded: true,
    },
    // Next.js app-directory handling for Storybook
    nextjs: {
      appDirectory: true,
    },
    // Accessibility: axe-core runs on every story. A non-zero error count is
    // surfaced in the a11y panel and blocks merges via Chromatic/CI.
    a11y: {
      // Run axe against the rendered story root.
      element: '#storybook-root',
      config: {},
      options: {},
    },
    options: {
      storySort: {
        order: ['Docs', 'UI', 'Wallet', 'Escrow', 'Dispute', 'Notifications', '*'],
      },
    },
  },
  decorators: [
    (Story) => (
      <StorybookProviders>
        <div className="min-h-screen bg-gray-900 p-8 text-gray-100">
          <Story />
        </div>
      </StorybookProviders>
    ),
  ],
};

export default preview;
