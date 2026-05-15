import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './specs',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  globalTimeout: 300_000,
  retries: isCI ? 1 : 0,
  fullyParallel: false,
  workers: 1,
  reporter: isCI ? [['list']] : [['list'], ['html', { open: 'never' }]],
  outputDir: 'test-results',
  use: {
    ...devices['Desktop Chrome'],
    browserName: 'chromium',
    viewport: { width: 1280, height: 720 },
    actionTimeout: 10_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
  },
  webServer: [
    {
      command: 'VITE_API_URL= pnpm --dir ../../ui dev --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      command: 'VITE_API_URL=http://127.0.0.1:4100 pnpm --dir ../../ui dev --host 127.0.0.1 --port 4174 --strictPort',
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      command: 'pnpm exec tsx ./mock-server/index.ts',
      url: 'http://127.0.0.1:4100/test/health',
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: 'localStorage',
      use: {
        baseURL: 'http://127.0.0.1:4173',
      },
    },
    {
      name: 'httpBackend',
      use: {
        baseURL: 'http://127.0.0.1:4174',
      },
    },
  ],
});
