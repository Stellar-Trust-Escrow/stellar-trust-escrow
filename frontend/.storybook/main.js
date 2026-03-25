/** @type {import('@storybook/nextjs').StorybookConfig} */
const config = {
  stories: ['../components/**/*.stories.@(js|jsx|ts|tsx)'],
  addons: ['@storybook/addon-essentials', '@storybook/addon-interactions', '@storybook/addon-a11y'],
  framework: {
    name: '@storybook/nextjs',
    options: {
      // Use the Storybook-safe Next.js config to avoid the API URL env check
      nextConfigPath: './.storybook/next.config.js',
    },
  },
  docs: {
    autodocs: 'tag',
  },
};

export default config;
