import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/integration/**/*.spec.ts'],
    testTimeout: 120000,
    hookTimeout: 120000,
    fileParallelism: false,
  },
});
