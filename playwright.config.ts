import { defineConfig, devices, type Project } from '@playwright/test';
import { loadConfig, type BrowserName } from './src/core/config/config.loader';

const { env, app } = loadConfig();
const headed = process.argv.includes('--headed');
const workers = headed ? 1 : process.env.CI ? env.workers.ci : env.workers.local;

function browserUse(browser: BrowserName): Project['use'] {
  switch (browser) {
    case 'chromium':
  return {
    ...devices['Desktop Chrome'],
    viewport: null,
    deviceScaleFactor: undefined,
    launchOptions: { args: ['--start-maximized'] },
  };
    case 'firefox':
      return { ...devices['Desktop Firefox'] };
    case 'webkit':
      return { ...devices['Desktop Safari'] };
  }
}

const webProjects: Project[] = app.execution.webBrowsers.map((browser) => ({
  name: `web-${browser}`,
  testMatch: '**/web/**/*.spec.ts',
  use: browserUse(browser),
}));

const e2eProjects: Project[] = app.execution.e2eBrowsers.map((browser) => ({
  name: `e2e-${browser}`,
  testMatch: '**/e2e/**/*.spec.ts',
  use: browserUse(browser),
}));

const apiBase = env.apiBaseUrl.replace(/\/$/, '');

export default defineConfig({
  testDir: './tests',
  outputDir: 'reports/test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? env.retries.ci : env.retries.local,
  ...(workers > 0 ? { workers } : {}),
  timeout: env.timeouts.test,
  expect: { timeout: env.timeouts.expect },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'reports/html' }],
  ],
  use: {
    baseURL: env.baseUrl,
    actionTimeout: env.timeouts.action,
    navigationTimeout: env.timeouts.navigation,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on',
    testIdAttribute: 'data-testid',
    locale: 'en-US',
    timezoneId: 'UTC',
  },
  webServer: env.startDemoServer
    ? {
        command: 'npx tsx demo/server.ts',
        url: `${apiBase}/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      }
    : undefined,
  projects: [
    {
      name: 'api',
      testMatch: '**/api/**/*.spec.ts',
    },
    ...webProjects,
    ...e2eProjects,
  ],
});
