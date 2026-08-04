import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4190',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      channel: process.env.CI ? undefined : 'chrome',
    },
  }],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4190 --strictPort',
    url: 'http://127.0.0.1:4190',
    reuseExistingServer: !process.env.CI,
  },
});
