import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  outputDir: '../../artifacts/browser-tests',
  timeout: 30000,
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    channel: 'chromium',
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
  },
});
