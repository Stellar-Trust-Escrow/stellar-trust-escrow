/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^.+\\.css$': 'identity-obj-proxy',
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
    '!**/*.stories.{js,jsx}',
    '!**/node_modules/**',
  ],
  coverageThreshold: {
    global: { lines: 70, branches: 70, functions: 70, statements: 70 },
  },
};
