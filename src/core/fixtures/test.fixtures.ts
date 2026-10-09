import { test as base } from '@playwright/test';
import path from 'path';
import { ApiClient } from '../api/api.client';
import { loadConfig, projectRoot, type AppProfile, type EnvironmentConfig } from '../config/config.loader';
import { DataStore } from '../data/data.loader';
import { ConsumersPage } from '../../pages/consumers.page';
import { LoginPage } from '../../pages/login.page';

type FrameworkFixtures = {
  app: AppProfile;
  env: EnvironmentConfig;
  data: DataStore;
  api: ApiClient;
  loginPage: LoginPage;
  consumersPage: ConsumersPage;
};

export const test = base.extend<FrameworkFixtures>({
  page: async ({ page }, use, testInfo) => {
    const headed = testInfo.project.use.headless === false;
    const chromium = (testInfo.project.use.defaultBrowserType ?? 'chromium') === 'chromium';
    if (headed && chromium) {
      const client = await page.context().newCDPSession(page);
      const { windowId } = await client.send('Browser.getWindowForTarget');
      await client.send('Browser.setWindowBounds', {
        windowId,
        bounds: { windowState: 'maximized' },
      });
    }
    await use(page);
  },
  app: async ({}, use) => {
    await use(loadConfig().app);
  },
  env: async ({}, use) => {
    await use(loadConfig().env);
  },
  data: async ({}, use) => {
    await use(new DataStore(path.join(projectRoot, 'data')));
  },
  api: async ({ request, app, env }, use) => {
    await use(new ApiClient(request, app, env));
  },
  loginPage: async ({ page, app }, use) => {
    await use(new LoginPage(page, app));
  },
  consumersPage: async ({ page, app }, use) => {
    await use(new ConsumersPage(page, app));
  },
});

export function functionality(name: string): void {
  test.beforeEach(({}, testInfo) => {
    testInfo.annotations.push({ type: 'functionality', description: name });
  });
}

export function requireFeature(app: AppProfile, feature: string): void {
  test.skip(!app.features[feature], `Feature '${feature}' is disabled for app '${app.id}'`);
}

export { expect } from '@playwright/test';
