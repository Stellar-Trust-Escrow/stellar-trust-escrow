import type { StorybookConfig } from '@storybook/nextjs';

/**
 * Storybook configuration for the Stellar Trust Escrow frontend.
 *
 * Uses the `@storybook/nextjs` framework adapter so that Next.js features
 * (next/link, next/image, next/font, app router, environment variables) work
 * inside stories. Stories are co-located with components as `*.stories.tsx`.
 */
const config: StorybookConfig = {
  stories: ['../components/**/*.stories.@(js|jsx|ts|tsx)'],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
    '@storybook/addon-a11y',
    '@chromatic-com/storybook',
  ],
  framework: {
    name: '@storybook/nextjs',
    options: {
      // Use the Storybook-safe Next.js config to avoid the API URL env check
      // that the root next.config.js performs.
      nextConfigPath: './.storybook/next.config.js',
    },
  },
  docs: {
    autodocs: 'tag',
  },
  // The `@storybook/nextjs` builder uses Next's bundled webpack. With newer
  // Next versions its filesystem cache can throw during `Cache.shutdown`
  // ("Cannot read properties of undefined (reading 'tap')"). Disable the
  // persistent cache so static builds complete reliably in CI and locally.
  webpackFinal: async (config) => {
    config.cache = false;
    return config;
  },
  // Fail the build on hard errors only; a11y violations are surfaced in the
  // addon panel (and on Chromatic) rather than blocking static builds.
  typescript: {
    check: false,
    reactDocgen: 'react-docgen',
  },
};

export default config;
