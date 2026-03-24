/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^.+\\.css$': 'identity-obj-proxy',
    '^next/link$': '<rootDir>/tests/__mocks__/next/link.jsx',
    '^next/navigation$': '<rootDir>/tests/__mocks__/next/navigation.js',
  },
  transform: {
    '^.+\\.[jt]sx?$': ['babel-jest', { presets: ['next/babel'] }],
  },
  testMatch: ['<rootDir>/tests/**/*.test.[jt]s?(x)'],
  collectCoverageFrom: [
    'components/**/*.{js,jsx}',
    'app/**/*.{js,jsx}',
    'hooks/**/*.{js,jsx}',
    '!**/*.stories.{js,jsx}',
    '!**/node_modules/**',
  ],
  coverageThreshold: {
    global: { lines: 70, branches: 70, functions: 70, statements: 70 },
  },
};

export default config;
