module.exports = {
  maxWorkers: 1,
  testTimeout: 120000,
  verbose: true,
  bail: false,
  testEnvironment: './environment',
  reporters: ['detox/runners/jest/reporter'],
  globalSetup: 'detox/runners/jest/globalSetup',
  globalTeardown: 'detox/runners/jest/globalTeardown',
  testMatch: ['<rootDir>/**/*.test.ts', '<rootDir>/**/*.e2e.js'],
};
