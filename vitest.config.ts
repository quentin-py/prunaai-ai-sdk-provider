import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.integration.ts'],
    // Enable parallel execution for faster test runs
    threads: true,
    maxThreads: 2,
    minThreads: 1,
  },
});
