import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.integration.ts'],
    testTimeout: 600_000, // 10 min per test (video generation can take 5+ minutes)
    hookTimeout: 30_000,
    reporters: ['verbose', './scripts/integration-reporter.js'],
    // Enable parallel execution within test files
    threads: true,
    maxThreads: 2, // Reduced to 2 for video tests (they're resource intensive)
    minThreads: 1,
  },
});
