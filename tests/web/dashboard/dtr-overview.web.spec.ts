import type { Page } from '@playwright/test';
import type { AppProfile } from '../../../src/core/config/config.loader';
import type { DataStore } from '../../../src/core/data/data.loader';
import { expect, functionality, test } from '../../../src/core/fixtures/test.fixtures';
import { calendarMonth, monthRangeText } from '../../../src/core/components/month-grid';
import { DtrOverviewPage, type DtrPeriod, type DtrSnapshot } from '../../../src/pages/dtr-overview.page';
import { LoginPage } from '../../../src/pages/login.page';

interface MonthFilter {
  monthYear: string;
  period: DtrPeriod;
}

async function start(loginPage: LoginPage, data: DataStore, page: Page, app: AppProfile): Promise<{ overview: DtrOverviewPage; snapshot: DtrSnapshot }> {
  await loginPage.open();
  await loginPage.signIn(data.user('validAdmin'));
  await page.waitForURL(/\/consumers$/, { timeout: 20_000 });
  const overview = new DtrOverviewPage(page, app);
  const snapshot = await overview.openFromManagement();
  return { overview, snapshot };
}

async function openSelected(loginPage: LoginPage, data: DataStore, page: Page, app: AppProfile): Promise<{ overview: DtrOverviewPage; snapshot: DtrSnapshot; filter: MonthFilter }> {
  const opened = await start(loginPage, data, page, app);
  const filter = selectedFilter(data);
  const snapshot = await opened.overview.applySelectedMonth(filter.monthYear, filter.period);
  return { overview: opened.overview, snapshot, filter };
}

test.describe('DTR overview @dashboard @regression', () => {
  test.use({ timezoneId: 'Asia/Kolkata' });
  functionality('Dashboard');
  test.describe.configure({ timeout: 180_000 });

  test('DTR Management opens DTR Overview for the current month @smoke', async ({ loginPage, data, page, app }) => {
    const { overview, snapshot } = await start(loginPage, data, page, app);
    await overview.expectShell();
    overview.expectInitialRequests(snapshot);
    overview.flushIssues();
  });

  test('Choosing a month refreshes every chart and card', async ({ loginPage, data, page, app }) => {
    test.setTimeout(180_000);
    const { overview } = await start(loginPage, data, page, app);
    const filter = selectedFilter(data);
    await overview.expectMonthBounds();
    await overview.applySelectedMonth(filter.monthYear, filter.period);
    overview.flushIssues();
  });

  test('Power and energy can each be Daily or Weekly, and the choices stay separate', async ({ loginPage, data, page, app }) => {
    test.setTimeout(180_000);
    const { overview } = await start(loginPage, data, page, app);
    const filter = selectedFilter(data);
    await overview.applySelectedMonth(filter.monthYear, 'daily');
    await overview.expectPeriodMenus(filter.monthYear);
    overview.flushIssues();
  });

  test('Each card count matches the DTR list it opens', async ({ loginPage, data, page, app }) => {
    test.setTimeout(300_000);
    const { overview, snapshot, filter } = await openSelected(loginPage, data, page, app);
    const month = calendarMonth(filter.monthYear);
    await overview.expectCards(snapshot.summary.body, 'daily');
    await overview.expectCardDrillDowns(snapshot.summary.body, 'Daily', month.label);
    overview.flushIssues();
  });

  test('Power Status shows each day, and On and Off open that day’s list', async ({ loginPage, data, page, app }) => {
    test.setTimeout(240_000);
    const { overview, snapshot, filter } = await openSelected(loginPage, data, page, app);
    const month = calendarMonth(filter.monthYear);
    await overview.expectPower(snapshot.power.body, filter.period);
    await overview.expectPowerDrillDown(snapshot.power.body, filter.period, filter.monthYear, periodLabel(filter.period), month.label);
    overview.flushIssues();
  });

  test('Communication Status shows the total, and each slice opens its list', async ({ loginPage, data, page, app }) => {
    test.setTimeout(240_000);
    const { overview, snapshot, filter } = await openSelected(loginPage, data, page, app);
    const month = calendarMonth(filter.monthYear);
    await overview.expectCommunication(snapshot.communication.body);
    await overview.expectCommunicationDrillDown(periodLabel(filter.period), month.label, filter.monthYear);
    overview.flushIssues();
  });

  test('Percentage Loading shows each band, and each band opens its list', async ({ loginPage, data, page, app }) => {
    test.setTimeout(300_000);
    const { overview, snapshot, filter } = await openSelected(loginPage, data, page, app);
    const month = calendarMonth(filter.monthYear);
    await overview.expectPercentageLoading(snapshot.percentage.body);
    await overview.expectPercentageDrillDowns(snapshot.percentage.body, periodLabel(filter.period), month.label, filter.monthYear);
    overview.flushIssues();
  });

  test('Energy Consumption shows each day, and a day opens its details', async ({ loginPage, data, page, app }) => {
    test.setTimeout(240_000);
    const { overview, snapshot, filter } = await openSelected(loginPage, data, page, app);
    const month = calendarMonth(filter.monthYear);
    await overview.expectConsumption(snapshot.consumption.body, filter.period, monthRangeText(filter.monthYear));
    await overview.expectConsumptionDrillDown(snapshot.consumption.body, periodLabel(filter.period), month.label, filter.monthYear);
    overview.flushIssues();
  });

  test('Load unbalance and voltage unbalance show each slice, and a slice opens its list', async ({ loginPage, data, page, app }) => {
    test.setTimeout(300_000);
    const { overview, snapshot, filter } = await openSelected(loginPage, data, page, app);
    const month = calendarMonth(filter.monthYear);
    await overview.expectLoadUnbalance(snapshot.load.body, filter.monthYear);
    await overview.expectSeverityDrillDowns('Load Unbalance', '/dtr/dashboard/load-unbalance', '/dashboard/dtr/load-unbalance-details', 'Load Unbalance', periodLabel(filter.period), month.label, filter.monthYear);
    await overview.expectVoltageUnbalance(snapshot.voltage.body);
    await overview.expectSeverityDrillDowns('Voltage Unbalance', '/dtr/dashboard/voltage-unbalance', '/dashboard/dtr/voltage-unbalance-details', 'Voltage Unbalance', periodLabel(filter.period), month.label, filter.monthYear);
    overview.flushIssues();
  });

  test('Downloading a chart stays on DTR Overview', async ({ loginPage, data, page, app }) => {
    test.setTimeout(180_000);
    const { overview } = await openSelected(loginPage, data, page, app);
    await overview.expectDownloads();
    overview.flushIssues();
  });

  test('A failed summary does not show a count taken from the error', async ({ loginPage, data, page, app }) => {
    const overview = new DtrOverviewPage(page, app);
    await loginPage.open();
    await loginPage.signIn(data.user('validAdmin'));
    await page.waitForURL(/\/consumers$/, { timeout: 20_000 });
    await page.route('**/dashboard/dtr/summary**', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: data.json('payloads/mocks.json', 'dtrSummaryFailed') }),
    );
    await overview.sectionTab().click();
    await expect(page).toHaveURL(/\/dtr\/dashboard$/);
    await expect(page.getByRole('main')).not.toContainText('987654321');
  });

  test('Opening DTR Overview without signing in returns to the sign-in page', async ({ page }) => {
    await page.goto('/dtr/dashboard');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText('DTR Overview', { exact: true })).toHaveCount(0);
  });
});

function selectedFilter(data: DataStore): MonthFilter {
  const filter = data.payload<MonthFilter>('payloads/dtr-overview.json', 'selectedMonth');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(filter.monthYear)) {
    throw new Error(`selectedMonth.monthYear must be YYYY-MM. Received ${filter.monthYear}`);
  }
  return filter;
}

function periodLabel(period: DtrPeriod): string {
  return period === 'weekly' ? 'Weekly' : 'Daily';
}
