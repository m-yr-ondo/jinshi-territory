import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:5175',
    headless: true,
    viewport: { width: 1280, height: 720 },
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
          args: ['--no-sandbox', '--disable-dev-shm-usage']
        }
      : undefined
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5175',
    reuseExistingServer: true,
    timeout: 30_000
  }
});
