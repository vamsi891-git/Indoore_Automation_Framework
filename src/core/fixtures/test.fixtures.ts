import { test as base } from '@playwright/test';
import path from 'path';
import { ApiClient } from '../api/api.client';
import '../api/schema.matchers';
import { getSchemaValidator } from '../api/schema.matchers';
import type { SchemaValidator } from '../api/schema.validator';
import { loadConfig, projectRoot, type AppProfile, type EnvironmentConfig } from '../config/config.loader';
import { DataStore } from '../data/data.loader';
import { ConsumersPage } from '../../pages/consumers.page';
import { DashboardPage } from '../../pages/dashboard.page';
import { LoginPage } from '../../pages/login.page';

type FrameworkFixtures = {
  app: AppProfile;
  env: EnvironmentConfig;
  data: DataStore;
  api: ApiClient;
  schema: SchemaValidator;
  loginPage: LoginPage;
  consumersPage: ConsumersPage;
  dashboardPage: DashboardPage;
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
  schema: async ({}, use) => {
    await use(getSchemaValidator());
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
  dashboardPage: async ({ page, api, data, app }, use) => {
    const auth = await api.authenticate(data.user('validAdmin'));
    await page.addInitScript(
      ({ key, token }) => {
        localStorage.setItem(key, token);
      },
      { key: app.storage.authToken, token: auth.body.data.accessToken },
    );
    await use(new DashboardPage(page, app));
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
