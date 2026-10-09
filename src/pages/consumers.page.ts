import { expect, Locator } from '@playwright/test';
import { kolkataCalendar, openMonthGrid, pickMonth, previousMonth } from '../core/components/month-grid';
import {
  CategoryDistributionComponent,
  type CategoryRow,
} from '../core/components/category-distribution.component';
import { DonutComponent } from '../core/components/donut.component';
import {
  type CardName,
  type ConsumerOverviewHost,
  type DonutTitle,
  countEntries,
  expectCardDrillDowns as runCardDrillDowns,
  expectCardFooters as runCardFooters,
  expectCategoryDistributionCounts as runCategoryCounts,
  expectCategoryDrillDowns as runCategoryDrillDowns,
  expectMeterStatusCounts as runMeterStatusCounts,
  expectMonthFilters as runMonthFilters,
  expectOemDistributionCounts as runOemCounts,
  expectPhaseDistributionCounts as runPhaseCounts,
  expectPrepaidPlusPostpaid as runPrepaidPlusPostpaid,
  expectRelayStatusCounts as runRelayCounts,
  labeledEntries,
  listTotal,
  numberField,
  section,
  showingTotal,
  statusSlice,
  sumCounts,
  unwrapData,
} from '../core/components/consumer-overview-math';
import { BasePage } from './base.page';
 
export class ConsumersPage extends BasePage {
  private main (): Locator {
    return this.page.getByRole('main')
  }

  private async headerTab(name: string): Promise<Locator> {
    const tab = this.page.getByRole('navigation', { name: 'Main sections' }).getByRole('tab', { name, exact: true });
    await tab.waitFor();
    return tab;
  }

  private async control(role: 'link' | 'button' | 'tab', name: string | RegExp): Promise<Locator> {
    const locator = this.main().getByRole(role,{name,exact:typeof name === 'string'});
    await locator.first().waitFor();
    return locator.first();
}
heading():Promise<Locator> {
  return this.find('consumerOverview',this.main());
}

consumersTab(): Promise<Locator> {
  return this.headerTab('Consumers');
}
defalutDashboardTab():Promise<Locator> {
  return this.control('tab','Default dashboard');
}
period():Promise<Locator> {
  return this.control('button','Consumer dashboard month and year');
}

card(name: CardName): Promise<Locator> {
  return this.control('link', new RegExp(`^${name}\\b`));
}

widget(title: string): Locator {
  return this.main().locator('.bi-box-container-card').filter({ hasText: title }).first();
}

slice(name: string): Promise<Locator> {
  return this.control('button', name);
}

categoryLink(displayName: string): Promise<Locator> {
  return this.control('link', `Open ${displayName} category distribution details`);
}

async textOf(locator: Locator): Promise<string> {
  return (await locator.innerText()).replace(/\s+/g, ' ').trim();
}

async expectReady(): Promise<void> {
  await this.heading();
  await this.consumersTab();
}

async expectShell(): Promise<void> {
  await expect(await this.heading()).toBeVisible();
  await expect(await this.consumersTab()).toHaveAttribute('aria-selected', 'true');
  await expect(this.main().getByRole('tab', { name: 'Default Dashboard', exact: true })).toHaveAttribute('aria-selected', 'true');
  const live = this.main().getByRole('tab', { name: 'Live Communication', exact: true });
  await expect(live).toBeVisible();
  await expect(live).not.toHaveAttribute('aria-selected', 'true');
  await expect(await this.card('Consumers')).toBeVisible();
}

async expectOtherSectionsStay(): Promise<void> {
  const sections = this.page.getByRole('navigation', { name: 'Main sections' });
  await expect(sections.getByRole('tab', { name: 'DTR Management', exact: true })).toBeEnabled();
  for (const name of ['Water', 'DG', 'Gas']) {
    await expect(sections.getByRole('tab', { name, exact: true }), name).toBeDisabled();
  }
  await expect(this.page).toHaveURL(/\/consumers$/);
}

async expectHeaderStays(): Promise<void> {
  for (const name of [/^Open search$/, /^Open notifications/, /^Open profile menu$/]) {
    await this.page.getByRole('button', { name }).click();
    await this.page.keyboard.press('Escape');
    await expect(this.page).toHaveURL(/\/consumers$/);
    await expect(this.main().getByRole('tab', { name: 'Default Dashboard', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(await this.card('Consumers')).toBeVisible();
  }
  const dark = this.page.getByRole('button', { name: 'Switch to dark theme', exact: true });
  await dark.click();
  await this.page.getByRole('button', { name: 'Switch to light theme', exact: true }).click();
  await expect(this.page).toHaveURL(/\/consumers$/);
}

async expectDownloads(): Promise<void> {
  const widgets: Array<{ title: string; root: Locator }> = [
    { title: 'Meter Status', root: this.donut('Meter Status').root },
    { title: 'OEM Distribution', root: this.donut('OEM Distribution').root },
    { title: 'Relay Status Overview', root: this.donut('Relay Status Overview').root },
    { title: 'Phase Distribution', root: this.donut('Phase Distribution').root },
    { title: 'Category Distribution', root: this.categories().root },
  ];
  for (const widget of widgets) {
    const button = widget.root.getByRole('button', { name: /download/i });
    await expect(button, `${widget.title} download`).toHaveCount(1);
    await expect(button, `${widget.title} download enabled`).toBeEnabled();
    const download = this.page.waitForEvent('download');
    await button.click();
    const file = await download;
    expect(file.suggestedFilename().length, widget.title).toBeGreaterThan(0);
    await expect(this.page).toHaveURL(/\/consumers$/);
    await expect(this.main().getByRole('tab', { name: 'Default Dashboard', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  }
}

async expectCardFooters(metrics: Record<string, unknown>): Promise<void> {
  await runCardFooters(this.overviewHost(), metrics);
}

expectPrepaidPlusPostpaid(metrics: Record<string, unknown>): void {
  runPrepaidPlusPostpaid(metrics);
}

async expectMeterDrillDowns(meter: Record<string, unknown>): Promise<void> {
  if ((await this.main().getByTestId('consumer-meter-status-data-unavailable').count()) > 0) {
    console.log('ISSUE CO-023: meter status coverage is unavailable, so slice clicks are not opened');
    return;
  }
  const data = unwrapData(meter);
  await this.expectNamedDrillDown(
    'Meter Status',
    'Communicating',
    'communicationStatus',
    'communicating',
    numberField(data, 'communicatedConsumerMeters'),
  );
  await this.expectNamedDrillDown(
    'Meter Status',
    'Non-Communicating',
    'communicationStatus',
    'non-communicating',
    numberField(data, 'nonCommunicatedConsumerMeters'),
  );
}

async expectOemDrillDowns(metrics: Record<string, unknown>): Promise<void> {
  const slices = labeledEntries(section(metrics, 'oemWiseConsumer'), 'deviceManufacturerTblRefId');
  for (const slice of slices) {
    await this.expectOemSlice(slice);
  }
}

expectOemMatchesPhase(metrics: Record<string, unknown>): void {
  const oem = sumCounts(countEntries(section(metrics, 'oemWiseConsumer')));
  const phase = sumCounts(countEntries(section(metrics, 'phaseWiseConsumer')));
  expect(oem, 'OEM sum = phase sum').toBe(phase);
}

async expectMonthFilters(): Promise<Record<string, unknown>> {
  return runMonthFilters(this.overviewHost());
}

async expectPastMonthClicks(metrics: Record<string, unknown>): Promise<void> {
  const past = previousMonth(kolkataCalendar());
  const button = await this.period();
  const pastResponse = this.page
    .waitForResponse((item) => item.url().includes('/dashboard/consumer/meter-status') && item.ok(), { timeout: 60_000 })
    .catch(() => null);
  const grid = await openMonthGrid(this.page, button);
  await pickMonth(grid, past.year, past.monthIndex);
  const pastResult = await pastResponse;
  if (!pastResult) {
    console.log(`ISSUE CO-024: the month button shows "${await button.innerText()}" but GET /dashboard/consumer/meter-status did not succeed within 60s.`);
    expect(pastResult, 'past month meter-status').toBeTruthy();
    return;
  }
  const pastUrl = new URL(pastResult.url());
  expect(pastUrl.searchParams.get('monthYear'), 'past monthYear').toBe(past.ym);
  expect(pastUrl.searchParams.get('fromDate'), 'past fromDate').toBeTruthy();
  expect(pastUrl.searchParams.get('toDate'), 'past toDate').toBeTruthy();
  await expect(button, 'past month').toContainText(past.label);
  const pastMeter = unwrapData((await pastResult.json()) as Record<string, unknown>);

  await this.expectMeterStatusCounts(pastMeter);
  await this.expectMeterDrillDowns(pastMeter);
  await this.expectCardDrillDowns(metrics);
  await this.expectOemDistributionCounts(metrics);
  await this.expectOemDrillDowns(metrics);
  await this.expectRelayStatusCounts(metrics);
  await this.expectRelayDrillDowns(metrics);
  await this.expectPhaseDistributionCounts(metrics);
  await this.expectPhaseDrillDowns(metrics);
  await this.expectCategoryDistributionCounts(metrics);
  await this.expectCategoryDrillDowns(metrics);
}

async expectCardDrillDowns(metrics: Record<string, unknown>): Promise<void> {
  await runCardDrillDowns(this.overviewHost(), metrics);
}

async cardCount(name: CardName): Promise<number> {
  const text = (await this.textOf(await this.card(name))).replace(/,/g, '');
  const match = text.match(/\d+/);
  if (!match) {
    throw new Error(`No count on card ${name}: ${text}`);
  }
  return Number(match[0]);
}

donut(title: DonutTitle): DonutComponent {
  return new DonutComponent(this.page, DonutComponent.locate(this.main(), title), title);
}

private categories(): CategoryDistributionComponent {
  return new CategoryDistributionComponent(this.page, CategoryDistributionComponent.locate(this.main()));
}

private async expectOemSlice(slice: { label: string; count: number }): Promise<void> {
  const listResponse = this.page.waitForResponse(
    (response) =>
      response.ok() &&
      (response.url().includes('/dashboard/consumer/oem-distribution') ||
        response.url().includes('/master-data/consumer-master-data')),
    { timeout: 60_000 },
  );
  await this.donut('OEM Distribution').openSlice(slice.label);
  await expect(this.page).toHaveURL(/\/consumers\/dashboard\/oem-distribution(?:\?|$)/);
  const url = new URL(this.page.url());
  expect(url.searchParams.get('oem'), slice.label).toBe(slice.label);
  await expect(this.main().getByText('OEM Distribution', { exact: true }).first()).toBeVisible();
  const total = listTotal((await (await listResponse).json()) as unknown);
  if (total !== slice.count) {
    console.log(`ISSUE ${slice.label}: the donut count is ${slice.count} and the OEM list total is ${total}.`);
  }
  expect(total, `${slice.label} list total`).toBe(slice.count);
  expect(await this.footerTotal(), `${slice.label} footer`).toBe(slice.count);
  await this.returnToDefaultDashboard();
}

private async expectNamedDrillDown(
  title: DonutTitle,
  label: string,
  queryName: string,
  queryValue: string,
  count: number,
): Promise<void> {
  await this.expectSliceDrillDown(title, { label, count, refId: queryValue }, queryName);
}

private async expectSliceDrillDown(
  title: DonutTitle,
  slice: { label: string; count: number; refId: string },
  queryName: string,
): Promise<void> {
  const listResponse = this.page.waitForResponse(
    (response) => response.url().includes('/master-data/consumer-master-data') && response.ok(),
    { timeout: 60_000 },
  );
  await this.donut(title).openSlice(slice.label);
  const url = new URL(this.page.url());
  if (!/\/master-data\/consumers$/.test(url.pathname)) {
    console.log(`ISSUE ${title}: Open ${slice.label} details opened ${url.pathname}${url.search} instead of /master-data/consumers?${queryName}=${slice.refId}.`);
  }
  expect(url.pathname, slice.label).toMatch(/\/master-data\/consumers$/);
  expect(url.searchParams.get(queryName), slice.label).toBe(slice.refId);
  const body = (await (await listResponse).json()) as unknown;
  const total = listTotal(body);
  if (total !== slice.count) {
    console.log(`ISSUE ${slice.label}: the donut count is ${slice.count} and the consumer list total is ${total}.`);
  }
  expect(total, `${slice.label} list total`).toBe(slice.count);
  const footer = showingTotal(this.page);
  if ((await footer.count()) === 0) {
    console.log(`ISSUE ${slice.label}: the list API total is ${total}, but Consumer Data has no "Showing … of …" footer. The grid shows "No data available" with a filter applied.`);
  }
  expect(await this.footerTotal(), `${slice.label} footer`).toBe(slice.count);
  await this.returnToDefaultDashboard();
}

private async footerTotal(): Promise<number> {
  const footer = (await showingTotal(this.page).innerText()).replace(/,/g, '');
  const match = footer.match(/of\s+(\d+)/i);
  if (!match) {
    throw new Error(`No list total in footer: ${footer}`);
  }
  return Number(match[1]);
}

private async returnToDefaultDashboard(): Promise<void> {
  const heading = this.main().getByText('Consumer Overview', { exact: true });
  await this.page.goBack();
  try {
    await heading.waitFor({ state: 'visible', timeout: 15_000 });
  } catch {
    await this.page.goto(this.route('consumers'));
    await heading.waitFor({ state: 'visible', timeout: 20_000 });
  }
  await expect(this.main().getByRole('tab', { name: 'Default Dashboard', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
}

async expectMeterStatusCounts(meter: Record<string, unknown>): Promise<void> {
  await runMeterStatusCounts(this.overviewHost(), meter);
}

async expectOemDistributionCounts(metrics: Record<string, unknown>): Promise<void> {
  await runOemCounts(this.overviewHost(), metrics);
}

async expectRelayStatusCounts(metrics: Record<string, unknown>): Promise<void> {
  await runRelayCounts(this.overviewHost(), metrics);
}

async expectRelayDrillDowns(metrics: Record<string, unknown>): Promise<void> {
  const connection = section(metrics, 'connectionStatus');
  const connected = statusSlice(connection.cd, 'Connected');
  const disconnected = statusSlice(connection.td, 'Disconnected');
  await this.expectSliceDrillDown('Relay Status Overview', connected, 'connectionStatusTblRefId');
  await this.expectSliceDrillDown('Relay Status Overview', disconnected, 'connectionStatusTblRefId');
}

async expectPhaseDrillDowns(metrics: Record<string, unknown>): Promise<void> {
  const phases = labeledEntries(section(metrics, 'phaseWiseConsumer'), 'servicePointMeterPhaseTblRefId');
  for (const phase of phases) {
    await this.expectSliceDrillDown('Phase Distribution', phase, 'servicePointMeterPhaseTblRefId');
  }
}

async expectCategoryDrillDowns(metrics: Record<string, unknown>): Promise<void> {
  await runCategoryDrillDowns(this.overviewHost(), metrics);
}

async expectPhaseDistributionCounts(metrics: Record<string, unknown>): Promise<void> {
  await runPhaseCounts(this.overviewHost(), metrics);
}

async expectCategoryDistributionCounts(metrics: Record<string, unknown>): Promise<CategoryRow[]> {
  return runCategoryCounts(this.overviewHost(), metrics);
}

private overviewHost(): ConsumerOverviewHost {
  return {
    page: this.page,
    main: () => this.main(),
    textOf: (locator) => this.textOf(locator),
    card: (name) => this.card(name),
    period: () => this.period(),
    donut: (title) => this.donut(title),
    categories: () => this.categories(),
    cardCount: (name) => this.cardCount(name),
    footerTotal: () => this.footerTotal(),
    returnToDefaultDashboard: () => this.returnToDefaultDashboard(),
  };
}
}
