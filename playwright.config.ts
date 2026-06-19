import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    // WebGL en headless (maplibre)
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev --port 3000 --hostname 127.0.0.1',
    url: 'http://127.0.0.1:3000',
    timeout: 120_000,
    reuseExistingServer: true,
  },
});
