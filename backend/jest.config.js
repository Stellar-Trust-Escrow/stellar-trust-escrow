export default {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: ['api/controllers/**/*.js', 'lib/pagination.js', 'services/**/*.js', '!**/node_modules/**'],
  coverageReporters: ['text', 'lcov'],
};
