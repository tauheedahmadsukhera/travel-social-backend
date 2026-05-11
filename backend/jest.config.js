module.exports = {
  testEnvironment: 'node',
  verbose: true,
  testTimeout: 30000,
  detectOpenHandles: true,
  forceExit: true,
  testMatch: ['**/tests/**/*.test.js'],
  setupFilesAfterEnv: ['./tests/setup.js']
};
