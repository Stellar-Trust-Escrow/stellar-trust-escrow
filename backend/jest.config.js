export default {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  collectCoverageFrom: [
    'api/controllers/**/*.js',
    'lib/pagination.js',
    'services/**/*.js',
    '!**/node_modules/**',
  ],
  coverageReporters: ['text', 'lcov'],
  moduleNameMapper: {
    // Map redis to a manual mock so tests don't need the real package
    '^redis$': '<rootDir>/__mocks__/redis.js',
    // Prisma ESM client → CJS-compatible mock
    '^@prisma/client$': '<rootDir>/__mocks__/@prisma/client.js',
  },
};
