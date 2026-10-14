import { defineConfig, devices } from '@playwright/test';
const port = process.env.PW_PORT ?? '4321';
export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: `http://localhost:${port}` },
  webServer: { command: `npm run build && PORT=${port} node scripts/serve-dist.mjs`, url: `http://localhost:${port}`, reuseExistingServer: !process.env.CI, timeout: 180_000 },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
