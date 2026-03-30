/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^.+\\.css$': 'identity-obj-proxy',
    '^@/(.*)$': '<rootDir>/$1',
    '^next/link$': '<rootDir>/tests/__mocks__/next/link.jsx',
    '^next/navigation$': '<rootDir>/tests/__mocks__/next/navigation.js',
    '^next/image$': '<rootDir>/tests/__mocks__/next/image.jsx',
  },
  transform: {
    '^.+\\.[jt]sx?$': [
      'babel-jest',
      { presets: [['next/babel', { 'preset-react': { runtime: 'automatic' } }]] },
    ],
  },
  testMatch: ['<rootDir>/tests/**/*.test.[jt]s?(x)'],
  collectCoverageFrom: [
    'components/**/*.{js,jsx}',
    'app/**/*.{js,jsx}',
    'hooks/**/*.{js,jsx}',
    'lib/**/*.{js,jsx}',
    '!**/*.stories.{js,jsx}',
    '!**/node_modules/**',
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: { lines: 60, branches: 50, functions: 60, statements: 60 },
  },
};
