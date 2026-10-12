const shared = {
  testEnvironment: 'node',
  testTimeout: 30000
};

module.exports = {
  collectCoverageFrom: ['src/**/*.js', '!src/server.js'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  projects: [
    {
      ...shared,
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/unit/**/*.test.js']
    },
    {
      ...shared,
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/blackbox/**/*.test.js', '<rootDir>/tests/api/**/*.test.js']
    },
    {
      ...shared,
      displayName: 'e2e',
      testMatch: ['<rootDir>/tests/e2e/**/*.test.js']
    }
  ]
};
