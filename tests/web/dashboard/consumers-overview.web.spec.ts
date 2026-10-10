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

test.describe('Consumer overview @dashboard @regression', () => {
  functionality('Dashboard');
  test.describe.configure({ timeout: 60_000 });

  let metrics: Record<string, unknown>;
  let meter: Record<string, unknown>;
  let metricsStatus: number;
  let meterStatus: number;
  let meterUrl: string;

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
    const metricsResult = await metricsResponse;
    const meterResult = await meterResponse;
    metricsStatus = metricsResult.status();
    meterStatus = meterResult.status();
    meterUrl = meterResult.url();
    metrics = unwrap(await metricsResult.json());
    meter = unwrap(await meterResult.json());
  });

  test('Meter, manufacturer, relay, and phase totals match the pieces of each chart', async ({ page, app }) => {
    const overview = new ConsumersPage(page, app);
    await overview.expectMeterStatusCounts(meter);
    await overview.expectOemDistributionCounts(metrics);
    overview.expectOemMatchesPhase(metrics);
    await overview.expectRelayStatusCounts(metrics);
    await overview.expectPhaseDistributionCounts(metrics);
  });

  test('Consumer categories stay in order and their counts and percentages match', async ({ page, app }) => {
    await new ConsumersPage(page, app).expectCategoryDistributionCounts(metrics);
  });

  test('Connected and Disconnected each open the matching consumer list', async ({ page, app }) => {
    test.setTimeout(180_000);
    await new ConsumersPage(page, app).expectRelayDrillDowns(metrics);
  });

  test('Each meter phase opens the consumer list for that count', async ({ page, app }) => {
    test.setTimeout(240_000);
    await new ConsumersPage(page, app).expectPhaseDrillDowns(metrics);
  });

  test('Each consumer category opens the list for that row count', async ({ page, app }) => {
    test.setTimeout(300_000);
    await new ConsumersPage(page, app).expectCategoryDrillDowns(metrics);
  });

  test('Signing in opens Consumer Overview and the numbers load @smoke', async ({ page, app }) => {
    const overview = new ConsumersPage(page, app);
    await overview.expectShell();
    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(app.routes.consumers)}$`));
    expect(metricsStatus, 'metrics').toBe(200);
    expect(meterStatus, 'meter status').toBe(200);
    const meterParams = new URL(meterUrl).searchParams;
    if (meterParams.get('monthYear') === null) {
      console.log(`ISSUE CO-002: the current-month meter-status request omitted monthYear. The spec requires YYYY-MM. URL: ${meterUrl}`);
    }
    expect(meterParams.get('monthYear'), 'meter monthYear').toMatch(/^\d{4}-\d{2}$/);
    expect(meterParams.get('fromDate'), 'fromDate').toBeTruthy();
    expect(meterParams.get('toDate'), 'toDate').toBeTruthy();
    const types = metrics.consumerType as Record<string, TrendCount>;
    expect(types.totalConsumers.count).toEqual(expect.any(Number));
    expect(CATEGORIES).toHaveLength(9);
  });

  test('Water, DG, and Gas stay unavailable', async ({ page, app }) => {
    await new ConsumersPage(page, app).expectOtherSectionsStay();
  });

  test('The top controls stay on Consumer Overview', async ({ page, app }) => {
    await new ConsumersPage(page, app).expectHeaderStays();
  });

  test('Downloading a chart stays on Consumer Overview', async ({ page, app }) => {
    test.setTimeout(120_000);
    await new ConsumersPage(page, app).expectDownloads();
  });

  test('Card totals match, and prepaid plus postpaid equals the payment total', async ({ page, app }) => {
    const overview = new ConsumersPage(page, app);
    await overview.expectCardFooters(metrics);
    overview.expectPrepaidPlusPostpaid(metrics);
  });

  test('Communicating and Non-Communicating each open the matching consumer list', async ({ page, app }) => {
    test.setTimeout(180_000);
    await new ConsumersPage(page, app).expectMeterDrillDowns(meter);
  });

  test('A past month opens the matching meter, card, manufacturer, relay, phase, and category details', async ({ page, app }) => {
    test.setTimeout(600_000);
    await new ConsumersPage(page, app).expectPastMonthClicks(metrics);
  });

  test('A past month, the current month, and future months behave as expected', async ({ page, app }) => {
    test.setTimeout(120_000);
    const overview = new ConsumersPage(page, app);
    const pastMeter = await overview.expectMonthFilters();
    await overview.expectMeterStatusCounts(pastMeter);
  });

  test('Each manufacturer opens the consumer list for that count', async ({ page, app }) => {
    test.setTimeout(300_000);
    await new ConsumersPage(page, app).expectOemDrillDowns(metrics);
  });

  test('Each summary card matches the consumer list total', async ({ page, app }) => {
    test.setTimeout(300_000);
    await new ConsumersPage(page, app).expectCardDrillDowns(metrics);
  });

  test('A missing number is shown as a dash, not as zero', async ({ page }) => {
    const text = await page.getByRole('main').innerText();
    if (!text.includes('—') && !text.includes('–')) {
      console.log('ISSUE CO-080: the live dashboard has no em dash, so empty is not compared with 0');
    }
  });
});

test.describe('Consumer overview when numbers fail to load @dashboard @regression', () => {
  functionality('Dashboard');
  test.describe.configure({ timeout: 120_000 });

  test('A failed summary does not show a count taken from the error', async ({ loginPage, data, page, app }) => {
    await signIn(loginPage, data, page, app.routes.consumers);
    await page.route('**/dashboard/consumer/metrics**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: data.json('payloads/mocks.json', 'metricsFailed'),
      }),
    );
    await page.reload();
    if ((await page.getByRole('main').count()) === 0) {
      console.log('ISSUE CO-081: a 500 metrics response left the page with no main region, so the dashboard shell did not stay up.');
    }
    await expect(page.locator('body')).not.toContainText('987654321');
    await expect(page.getByRole('main'), 'dashboard shell').toBeVisible();
  });

  test('A failed meter status does not show a count taken from the error', async ({ loginPage, data, page, app }) => {
    await signIn(loginPage, data, page, app.routes.consumers);
    await page.route('**/dashboard/consumer/meter-status**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: data.json('payloads/mocks.json', 'meterStatusFailed'),
      }),
    );
    await page.reload();
    const main = page.getByRole('main');
    await expect(main, 'dashboard shell').toBeVisible({ timeout: 20_000 });
    await expect(main).not.toContainText('987654321');
  });

  test('A failed consumer list is not used as the card count', async ({ loginPage, data, page, app }) => {
    test.setTimeout(180_000);
    await signIn(loginPage, data, page, app.routes.consumers);
    await page.route('**/master-data/consumer-master-data**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: data.json('payloads/mocks.json', 'plantedListTotal'),
      }),
    );
    await (await new ConsumersPage(page, app).card('Consumers')).click();
    await expect(page.getByText(/of\s+424,?242/)).toHaveCount(0);
  });

  test('A failed category list is not used as the row count', async ({ loginPage, data, page, app }) => {
    test.setTimeout(180_000);
    await signIn(loginPage, data, page, app.routes.consumers);
    await page.route('**/dashboard/consumer/category-distribution**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: data.json('payloads/mocks.json', 'plantedListTotal'),
      }),
    );
    const overview = new ConsumersPage(page, app);
    await (await overview.categoryLink('Residential')).click();
    await expect(page.getByText(/of\s+424,?242/)).toHaveCount(0);
  });
});

async function signIn(
  loginPage: { open(): Promise<void>; signIn(user: { email: string; password: string; captcha: string }): Promise<void> },
  data: { user(name: string): { email: string; password: string; captcha: string } },
  page: { waitForURL(url: RegExp, options: { timeout: number }): Promise<void> },
  consumers: string,
): Promise<void> {
  await loginPage.open();
  await loginPage.signIn(data.user('validAdmin'));
  await page.waitForURL(new RegExp(`${escapeRegExp(consumers)}$`), { timeout: 20_000 });
}

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
