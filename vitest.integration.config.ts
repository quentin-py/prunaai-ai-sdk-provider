import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.integration.ts'],
    testTimeout: 1200_000, // 20 min per test (video generation can take 5+ minutes, some requests exceed 1 min)
    hookTimeout: 30_000,
    reporters: ['verbose', './scripts/integration-reporter.js'],
    // Enable parallel execution within test files
    threads: true,
    maxThreads: 2, // Reduced to 2 for video tests (they're resource intensive)
    minThreads: 1,
  },
});
