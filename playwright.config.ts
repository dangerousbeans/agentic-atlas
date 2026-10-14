import { defineConfig, devices } from '@playwright/test';
const port = process.env.PW_PORT ?? '4321';
// PW_SKIP_BUILD: serve the existing dist/ (CI builds once, before budget, Lighthouse and Playwright).
const serve = `PORT=${port} node scripts/serve-dist.mjs`;
export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: `http://localhost:${port}` },
  webServer: { command: process.env.PW_SKIP_BUILD ? serve : `npm run build && ${serve}`, url: `http://localhost:${port}`, reuseExistingServer: !process.env.CI, timeout: 180_000 },
  projects: [
    { name: 'chromium', testIgnore: /perf\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    // Timing-sensitive specs run alone: after every other test has finished (dependencies), one worker, in order.
    {
      name: 'perf',
      testMatch: /perf\.spec\.ts/,
      dependencies: ['chromium'],
      fullyParallel: false,
      workers: 1,
      retries: process.env.CI ? 1 : 0,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
