/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^.+\\.css$': 'identity-obj-proxy',
    '^@/(.*)$': '<rootDir>/$1',
    '^next/link$': '<rootDir>/tests/__mocks__/next/link.jsx',
    '^next/navigation$': '<rootDir>/tests/__mocks__/next/navigation.js',
  },
  transform: {
    '^.+\\.[jt]sx?$': ['babel-jest', { presets: ['next/babel'] }],
  },
  testMatch: ['<rootDir>/tests/**/*.test.[jt]s?(x)'],
  testPathIgnorePatterns: ['<rootDir>/tests/e2e/'],
  collectCoverageFrom: [
    'components/**/*.{js,jsx}',
    'app/**/*.{js,jsx}',
    'hooks/**/*.{js,jsx}',
    'lib/**/*.{js,jsx}',
    '!**/*.stories.{js,jsx}',
    '!**/node_modules/**',
  ],
  coverageThreshold: {
    global: { lines: 60, branches: 50, functions: 60, statements: 60 },
  },
};

export default config;
