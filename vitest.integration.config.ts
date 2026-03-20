import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.integration.ts'],
    testTimeout: 120_000, // 2 min per test (real API calls)
    hookTimeout: 30_000,
    reporters: ['verbose', './scripts/integration-reporter.js'],
  },
});
