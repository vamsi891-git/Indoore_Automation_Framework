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

test.describe('DTR Overview UI against the page reads @dashboard @regression', () => {
  test.use({ timezoneId: 'Asia/Kolkata' });
  functionality('Dashboard');
  test.describe.configure({ timeout: 300_000 });

  test('DOE-001 the selected month widgets match the seven reads', async ({ loginPage, data, page, app }) => {
    const { overview, snapshot, filter } = await openSelected(loginPage, data, page, app);
    const month = calendarMonth(filter.monthYear);
    await overview.expectCards(snapshot.summary.body, 'daily');
    await overview.expectPower(snapshot.power.body, filter.period);
    await overview.expectConsumption(snapshot.consumption.body, filter.period, monthRangeText(filter.monthYear));
    await overview.expectCommunication(snapshot.communication.body);
    await overview.expectPercentageLoading(snapshot.percentage.body);
    await overview.expectLoadUnbalance(snapshot.load.body, filter.monthYear);
    await overview.expectVoltageUnbalance(snapshot.voltage.body);
    await expect(page).toHaveURL(/\/dtr\/dashboard$/);
    await expect(overview.monthButton()).toContainText(month.label);
    overview.flushIssues();
  });

  test('DOE-002 each card click matches the DTR list total', async ({ loginPage, data, page, app }) => {
    const { overview, snapshot, filter } = await openSelected(loginPage, data, page, app);
    const month = calendarMonth(filter.monthYear);
    await overview.expectCardDrillDowns(snapshot.summary.body, periodLabel(filter.period), month.label);
    overview.flushIssues();
  });

  test('DOE-003 power, communication, loading, load, and voltage clicks open the details the page loaded', async ({ loginPage, data, page, app }) => {
    const { overview, snapshot, filter } = await openSelected(loginPage, data, page, app);
    const month = calendarMonth(filter.monthYear);
    const label = periodLabel(filter.period);
    await overview.expectPowerDrillDown(snapshot.power.body, filter.period, filter.monthYear, label, month.label);
    await overview.expectCommunicationDrillDown(label, month.label, filter.monthYear);
    await overview.expectPercentageDrillDowns(snapshot.percentage.body, label, month.label, filter.monthYear);
    await overview.expectSeverityDrillDowns('Load Unbalance', '/dtr/dashboard/load-unbalance', '/dashboard/dtr/load-unbalance-details', 'Load Unbalance', label, month.label, filter.monthYear);
    await overview.expectSeverityDrillDowns('Voltage Unbalance', '/dtr/dashboard/voltage-unbalance', '/dashboard/dtr/voltage-unbalance-details', 'Voltage Unbalance', label, month.label, filter.monthYear);
    overview.flushIssues();
  });

  test('DOE-004 an energy point opens consumption details', async ({ loginPage, data, page, app }) => {
    const { overview, snapshot, filter } = await openSelected(loginPage, data, page, app);
    const month = calendarMonth(filter.monthYear);
    await overview.expectConsumptionDrillDown(snapshot.consumption.body, periodLabel(filter.period), month.label, filter.monthYear);
    overview.flushIssues();
  });
});

async function openSelected(loginPage: LoginPage, data: DataStore, page: Page, app: AppProfile): Promise<{ overview: DtrOverviewPage; snapshot: DtrSnapshot; filter: MonthFilter }> {
  await loginPage.open();
  await loginPage.signIn(data.user('validAdmin'));
  await page.waitForURL(/\/consumers$/, { timeout: 20_000 });
  const overview = new DtrOverviewPage(page, app);
  await overview.openFromManagement();
  const filter = selectedFilter(data);
  const snapshot = await overview.applySelectedMonth(filter.monthYear, filter.period);
  return { overview, snapshot, filter };
}

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
