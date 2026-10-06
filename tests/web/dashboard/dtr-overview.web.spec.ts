import type { Page } from '@playwright/test';
import type { AppProfile } from '../../../src/core/config/config.loader';
import type { DataStore } from '../../../src/core/data/data.loader';
import { expect, functionality, test } from '../../../src/core/fixtures/test.fixtures';
import { DtrOverviewPage, kolkataMonth, type DtrSnapshot } from '../../../src/pages/dtr-overview.page';
import { LoginPage } from '../../../src/pages/login.page';

async function start(loginPage: LoginPage, data: DataStore, page: Page, app: AppProfile): Promise<{ overview: DtrOverviewPage; snapshot: DtrSnapshot }> {
  await loginPage.open();
  await loginPage.signIn(data.user('validAdmin'));
  await page.waitForURL(/\/consumers$/, { timeout: 20_000 });
  const overview = new DtrOverviewPage(page, app);
  const snapshot = await overview.openFromManagement();
  return { overview, snapshot };
}

test.describe('DTR Overview @dashboard @regression', () => {
  test.use({ timezoneId: 'Asia/Kolkata' });
  functionality('Dashboard');
  test.describe.configure({ timeout: 120_000 });

  test('DO-001 DO-002 DTR Management opens DTR Overview and the seven reads succeed @smoke', async ({ loginPage, data, page, app }) => {
    const { overview, snapshot } = await start(loginPage, data, page, app);
    await overview.expectShell();
    overview.expectInitialRequests(snapshot);
    overview.flushIssues();
  });

  test('DO-003 Hourly, Daily, and Weekly are the only period choices', async ({ loginPage, data, page, app }) => {
    test.setTimeout(180_000);
    const { overview } = await start(loginPage, data, page, app);
    await overview.expectPeriodChoices();
    overview.flushIssues();
  });

  test('DO-004 DO-034 DO-046 DO-099 past, current, and future months', async ({ loginPage, data, page, app }) => {
    test.setTimeout(180_000);
    const { overview } = await start(loginPage, data, page, app);
    await overview.expectMonthBounds();
    await overview.expectPastMonth();
    overview.flushIssues();
  });

  test('past month clicks match Power, Communication, Percentage Loading, Energy, Load, and Voltage detail counts', async ({ loginPage, data, page, app }) => {
    test.setTimeout(600_000);
    const { overview, snapshot } = await start(loginPage, data, page, app);
    await overview.expectPastMonthClicks(snapshot.percentage.body);
    overview.flushIssues();
  });

  test('DO-006 each widget download stays on DTR Overview', async ({ loginPage, data, page, app }) => {
    test.setTimeout(180_000);
    const { overview } = await start(loginPage, data, page, app);
    await overview.expectDownloads();
    overview.flushIssues();
  });

  test('DO-010 to DO-018 card counts, footers, and DTR list filters', async ({ loginPage, data, page, app }) => {
    test.setTimeout(300_000);
    const { overview, snapshot } = await start(loginPage, data, page, app);
    const month = kolkataMonth();
    await overview.expectCards(snapshot.summary.body, 'daily');
    await overview.expectCardDrillDowns(snapshot.summary.body, 'Daily', month.label);
    overview.flushIssues();
  });

  test('DO-020 to DO-023 Power Status series and On and Off drill-downs', async ({ loginPage, data, page, app }) => {
    test.setTimeout(240_000);
    const { overview, snapshot } = await start(loginPage, data, page, app);
    await overview.expectPower(snapshot.power.body, 'daily');
    await overview.expectPowerDrillDown(snapshot.power.body, 'daily', null, 'Daily', kolkataMonth().label);
    overview.flushIssues();
  });

  test('DO-030 to DO-033 Communication Status center and both drill-downs', async ({ loginPage, data, page, app }) => {
    test.setTimeout(240_000);
    const { overview, snapshot } = await start(loginPage, data, page, app);
    await overview.expectCommunication(snapshot.communication.body);
    await overview.expectCommunicationDrillDown('Daily', kolkataMonth().label);
    overview.flushIssues();
  });

  test('DO-040 to DO-044 Percentage Loading bands and drill-downs', async ({ loginPage, data, page, app }) => {
    test.setTimeout(300_000);
    const { overview, snapshot } = await start(loginPage, data, page, app);
    await overview.expectPercentageLoading(snapshot.percentage.body);
    await overview.expectPercentageDrillDowns(snapshot.percentage.body, 'Daily', kolkataMonth().label);
    overview.flushIssues();
  });

  test('DO-050 to DO-053 Energy Consumption series and drill-downs', async ({ loginPage, data, page, app }) => {
    test.setTimeout(240_000);
    const { overview, snapshot } = await start(loginPage, data, page, app);
    await overview.expectConsumption(snapshot.consumption.body, 'daily', kolkataMonth().label);
    await overview.expectConsumptionDrillDown(snapshot.consumption.body, 'Daily', kolkataMonth().label, null);
    overview.flushIssues();
  });

  test('DO-060 to DO-063 Load Unbalance slices and drill-downs', async ({ loginPage, data, page, app }) => {
    test.setTimeout(240_000);
    const { overview, snapshot } = await start(loginPage, data, page, app);
    await overview.expectLoadUnbalance(snapshot.load.body, null);
    await overview.expectSeverityDrillDowns('Load Unbalance', '/dtr/dashboard/load-unbalance', '/dashboard/dtr/load-unbalance-details', 'Load Unbalance', 'Daily', kolkataMonth().label, null);
    overview.flushIssues();
  });

  test('DO-070 to DO-073 Voltage Unbalance slices and drill-downs', async ({ loginPage, data, page, app }) => {
    test.setTimeout(240_000);
    const { overview, snapshot } = await start(loginPage, data, page, app);
    await overview.expectVoltageUnbalance(snapshot.voltage.body);
    await overview.expectSeverityDrillDowns('Voltage Unbalance', '/dtr/dashboard/voltage-unbalance', '/dashboard/dtr/voltage-unbalance-details', 'Voltage Unbalance', 'Daily', kolkataMonth().label, null);
    overview.flushIssues();
  });

  test('DO-081 a failed summary does not paint a count from the error body', async ({ loginPage, data, page, app }) => {
    const overview = new DtrOverviewPage(page, app);
    await loginPage.open();
    await loginPage.signIn(data.user('validAdmin'));
    await page.waitForURL(/\/consumers$/, { timeout: 20_000 });
    await page.route('**/dashboard/dtr/summary**', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, data: { totalDtrs: { count: 987654321 } } }) }),
    );
    await overview.sectionTab().click();
    await expect(page).toHaveURL(/\/dtr\/dashboard$/);
    await expect(page.getByRole('main')).not.toContainText('987654321');
  });

  test('DO-086 opening DTR Overview without a token returns to login', async ({ page }) => {
    await page.goto('/dtr/dashboard');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText('DTR Overview', { exact: true })).toHaveCount(0);
  });

  test('DO-085 a user without DTRS_VIEW does not load dashboard counts', () => {
    test.skip(true, 'ISSUE DO-085: data/auth/users.json has no user without DTRS_VIEW');
  });
});
