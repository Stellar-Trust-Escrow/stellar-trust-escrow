import '../app/globals.css';

/** @type {import('@storybook/react').Preview} */
const preview = {
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
    },
    // Silence next/navigation and next/router warnings in Storybook
    nextjs: {
      appDirectory: true,
    },
  },
  // Wrap every story in a dark container so Tailwind dark-mode classes render correctly
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-gray-900 p-8 flex items-start justify-start">
        <Story />
      </div>
    ),
  ],
};

export default preview;
