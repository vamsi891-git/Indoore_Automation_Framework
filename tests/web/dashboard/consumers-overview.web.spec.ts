import { expect, functionality, test } from '../../../src/core/fixtures/test.fixtures';
import { ConsumersPage } from '../../../src/pages/consumers.page';

const CATEGORIES = [
    ['RES', 'Residential'],
    ['COM', 'Commercial'],
    ['IND', 'Industrial'],
    ['AGRI', 'Agriculture'],
    ['SCH', 'School'],
    ['SLIGHT', 'Street Light'],
    ['TEMP', 'Temporary'],
    ['EV', 'Electric Vehicle'],
    ['UNKNOWN', 'Unknown'],
  ] as const;

test.describe('Consumer Overview @dashboard @regression', () => {
  functionality('Dashboard');
  test.describe.configure({ timeout: 60_000 });

  let metrics: Record<string, unknown>;
  let meter: Record<string, unknown>;

  test.beforeEach(async ({ loginPage, data, page, app }) => {
    const metricsResponse = page.waitForResponse(
      (response) => response.url().includes('/dashboard/consumer/metrics') && response.url().includes('view=consumer'),
      { timeout: 55_000 },
    );
    const meterResponse = page.waitForResponse(
      (response) => response.url().includes('/dashboard/consumer/meter-status'),
      { timeout: 55_000 },
    );
    await loginPage.open();
    await loginPage.signIn(data.user('validAdmin'));
    await page.waitForURL(new RegExp(`${escapeRegExp(app.routes.consumers)}$`), { timeout: 20_000 });
    metrics = unwrap(await (await metricsResponse).json());
    meter = unwrap(await (await meterResponse).json());
  });

  test('CO-020 CO-030 CO-040 CO-050 Meter, OEM, Relay, and Phase totals equal their slice counts', async ({ page, app }) => {
    const overview = new ConsumersPage(page, app);
    await overview.expectMeterStatusCounts(meter);
    await overview.expectOemDistributionCounts(metrics);
    await overview.expectRelayStatusCounts(metrics);
    await overview.expectPhaseDistributionCounts(metrics);
  });

  test('CO-060 category rows stay in order and their counts and percents match', async ({ page, app }) => {
    await new ConsumersPage(page, app).expectCategoryDistributionCounts(metrics);
  });

  test('CO-041 CO-042 Connected and Disconnected open the consumer list for that status', async ({ page, app }) => {
    test.setTimeout(180_000);
    await new ConsumersPage(page, app).expectRelayDrillDowns(metrics);
  });

  test('CO-051 each phase opens the consumer list for that phase count', async ({ page, app }) => {
    test.setTimeout(240_000);
    await new ConsumersPage(page, app).expectPhaseDrillDowns(metrics);
  });

  test('CO-061 to CO-069 each category opens the list for that row count', async ({ page, app }) => {
    test.setTimeout(300_000);
    await new ConsumersPage(page, app).expectCategoryDrillDowns(metrics);
  });

  test('CO-001 sign-in opens Consumer Overview @smoke', async ({ page, app }) => {
    await new ConsumersPage(page, app).expectReady();
    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(app.routes.consumers)}$`));
    const types = metrics.consumerType as Record<string, TrendCount>;
    expect(types.totalConsumers.count).toEqual(expect.any(Number));
    expect(meter).toBeTruthy();
    expect(CATEGORIES).toHaveLength(9);
  });

  test('CO-010 to CO-013 each card count matches the Consumer Data list total', async ({ page, app }) => {
    test.setTimeout(300_000);
    await new ConsumersPage(page, app).expectCardDrillDowns(metrics);
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type TrendCount = { count: number; trends?: number[]; label?: string };

function unwrap(body: unknown): Record<string, unknown> {
  if (body && typeof body === 'object' && 'data' in body && (body as { success?: boolean }).success === true) {
    return (body as { data: Record<string, unknown> }).data;
  }
  return (body ?? {}) as Record<string, unknown>;
}
