module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/api/client.ts',
    'src/api/geocoding.ts',
    'src/theme/format.ts',
    'src/data/places.ts',
    'src/store/auth.ts',
    'src/store/rides.ts',
    'src/store/ride-utils.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'cobertura'],
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
};
