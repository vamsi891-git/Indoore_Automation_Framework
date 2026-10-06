import { expect, Locator, Page } from '@playwright/test';
import { expectFutureMonthsDisabled, kolkataCalendar, openMonthGrid, pickMonth, previousMonth } from '../core/components/month-grid';
import {
  CategoryDistributionComponent,
  type CategoryRow,
} from '../core/components/category-distribution.component';
import { DonutComponent, type DonutReading, type DonutSlice } from '../core/components/donut.component';
import { isRecord } from '../core/utils/guards';
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
  const consumerType = unwrapData(metrics).consumerType;
  if (!isRecord(consumerType)) {
    throw new Error('Missing consumerType on consumer metrics');
  }
  const cards: ReadonlyArray<{ name: CardName; field: string; prefix: string }> = [
    { name: 'Consumers', field: 'totalConsumers', prefix: 'Active consumers' },
    { name: 'Postpaid Connections', field: 'postpaid', prefix: '' },
    { name: 'Prepaid Connections', field: 'prepaid', prefix: '' },
    { name: 'Net Metering Consumers', field: 'netMeter', prefix: '' },
  ];
  for (const card of cards) {
    const slice = consumerType[card.field];
    if (!isRecord(slice) || !Array.isArray(slice.trends)) {
      console.log(`ISSUE CO-014: ${card.name} has no trends array`);
      continue;
    }
    const trends = slice.trends.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if (trends.length < 2) {
      console.log(`ISSUE CO-014: ${card.name} has fewer than two trend values`);
      continue;
    }
    const delta = trends[trends.length - 1] - trends[trends.length - 2];
    const text = await this.textOf(await this.card(card.name));
    expect(text, card.name).toContain('vs Last Month');
    if (card.prefix) {
      expect(text, card.name).toContain(card.prefix);
    }
    if (delta === 0) {
      expect(text, `${card.name} zero delta`).toContain('No Change');
      expect(text, `${card.name} zero pill`).toMatch(/\b0\b/);
      continue;
    }
    expect(text.toLowerCase(), card.name).toContain(delta < 0 ? 'decreased by' : 'increased by');
    expect(text.replace(/,/g, ''), card.name).toContain(String(Math.abs(delta)));
  }
}

expectPrepaidPlusPostpaid(metrics: Record<string, unknown>): void {
  const consumerType = unwrapData(metrics).consumerType;
  if (!isRecord(consumerType)) {
    throw new Error('Missing consumerType on consumer metrics');
  }
  const total = isRecord(consumerType.totalConsumers) ? numberField(consumerType.totalConsumers, 'count') : undefined;
  const prepaid = isRecord(consumerType.prepaid) ? numberField(consumerType.prepaid, 'count') : undefined;
  const postpaid = isRecord(consumerType.postpaid) ? numberField(consumerType.postpaid, 'count') : undefined;
  if (total === undefined || prepaid === undefined || postpaid === undefined) {
    throw new Error('Missing prepaid, postpaid, or total consumer counts');
  }
  expect(prepaid + postpaid, 'prepaid + postpaid = total consumers').toBe(total);
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
    await this.expectSliceDrillDown('OEM Distribution', slice, 'deviceManufacturerTblRefId');
  }
}

expectOemMatchesPhase(metrics: Record<string, unknown>): void {
  const oem = sumCounts(countEntries(section(metrics, 'oemWiseConsumer')));
  const phase = sumCounts(countEntries(section(metrics, 'phaseWiseConsumer')));
  expect(oem, 'OEM sum = phase sum').toBe(phase);
}

async expectMonthFilters(): Promise<Record<string, unknown>> {
  const current = kolkataCalendar();
  const past = previousMonth(current);
  const button = await this.period();
  await expect(button, 'present month').toContainText(current.label);

  const open = await openMonthGrid(this.page, button);
  await expectFutureMonthsDisabled(open, current);
  const pastResponse = this.page
    .waitForResponse((item) => item.url().includes('/dashboard/consumer/meter-status') && item.ok(), { timeout: 60_000 })
    .catch(() => null);
  await pickMonth(open, past.year, past.monthIndex);
  const pastResult = await pastResponse;
  if (!pastResult) {
    console.log(`ISSUE CO-024: the month button shows "${await button.innerText()}" but GET /dashboard/consumer/meter-status did not succeed within 60s.`);
    expect(pastResult, 'past month meter-status').toBeTruthy();
    return {};
  }
  const pastUrl = new URL(pastResult.url());
  expect(pastUrl.searchParams.get('monthYear'), 'past monthYear').toBe(past.ym);
  expect(pastUrl.searchParams.get('fromDate'), 'past fromDate').toBeTruthy();
  expect(pastUrl.searchParams.get('toDate'), 'past toDate').toBeTruthy();
  await expect(button, 'past month label').toContainText(past.label);
  const pastBody = unwrapData((await pastResult.json()) as Record<string, unknown>);

  const presentResponse = this.page
    .waitForResponse((item) => item.url().includes('/dashboard/consumer/meter-status') && item.ok(), { timeout: 15_000 })
    .catch(() => null);
  const again = await openMonthGrid(this.page, button);
  await pickMonth(again, current.year, current.monthIndex);
  await expect(button, 'present month restored').toContainText(current.label);
  const presentResult = await presentResponse;
  if (!presentResult) {
    console.log('ISSUE CO-024: choosing the current month again did not send meter-status. The month label changed and the earlier response was reused.');
  } else if (new URL(presentResult.url()).searchParams.get('monthYear') !== current.ym) {
    console.log(`ISSUE CO-024: the restored meter-status monthYear is "${new URL(presentResult.url()).searchParams.get('monthYear') ?? 'absent'}". The spec requires ${current.ym}.`);
  }
  expect(presentResult, 'choosing the current month did not request meter-status').toBeTruthy();
  expect(new URL(presentResult!.url()).searchParams.get('monthYear'), 'present monthYear').toBe(current.ym);
  return pastBody;
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
  await expect(await this.period(), 'past month kept after the detail pages').toContainText(past.label);
}

async expectCardDrillDowns(metrics: Record<string, unknown>): Promise<void> {
  const consumerType = unwrapData(metrics).consumerType;
  if (!isRecord(consumerType)) {
    throw new Error('Missing consumerType on consumer metrics');
  }
  const cards: ReadonlyArray<{
    name: CardName;
    field: 'totalConsumers' | 'postpaid' | 'prepaid' | 'netMeter';
  }> = [
    { name: 'Consumers', field: 'totalConsumers' },
    { name: 'Postpaid Connections', field: 'postpaid' },
    { name: 'Prepaid Connections', field: 'prepaid' },
    { name: 'Net Metering Consumers', field: 'netMeter' },
  ];

  for (const card of cards) {
    const slice = consumerType[card.field];
    if (!isRecord(slice)) {
      throw new Error(`Missing consumerType.${card.field}`);
    }
    const count = numberField(slice, 'count');
    expect(await this.cardCount(card.name), card.name).toBe(count);

    const listResponse = this.page.waitForResponse(
      (response) => response.url().includes('/master-data/consumer-master-data') && response.ok(),
      { timeout: 60_000 },
    );
    const link = await this.card(card.name);
    await link.scrollIntoViewIfNeeded();
    await link.click();

    const url = new URL(this.page.url());
    expect(url.pathname, card.name).toMatch(/\/master-data\/consumers$/);
    if (card.field === 'postpaid' || card.field === 'prepaid') {
      expect(url.searchParams.get('paymentContractTblRefId'), card.name).toBe(
        idField(slice, 'paymentContractTblRefId'),
      );
    }
    if (card.field === 'netMeter') {
      expect(url.searchParams.get('isNetMeter'), card.name).toBe('true');
    }
    if (card.field === 'totalConsumers') {
      expect(url.searchParams.get('paymentContractTblRefId'), card.name).toBeNull();
      expect(url.searchParams.get('isNetMeter'), card.name).toBeNull();
    }

    expect(listTotal(await (await listResponse).json()), `${card.name} list total`).toBe(count);
    expect(await this.footerTotal(), `${card.name} footer`).toBe(count);
    await this.returnToDefaultDashboard();
  }
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
  const unavailable = this.main().getByTestId('consumer-meter-status-data-unavailable');
  if ((await unavailable.count()) > 0) {
    await expect(unavailable).toBeVisible();
    return;
  }

  const data = unwrapData(meter);
  const total = numberField(data, 'totalConsumerMeters', ['totalMeterCount']);
  const communicating = numberField(data, 'communicatedConsumerMeters');
  const nonCommunicating = numberField(data, 'nonCommunicatedConsumerMeters');
  expect(communicating + nonCommunicating, METER_TOTAL).toBe(total);

  const reading = await this.donut('Meter Status').read();
  expect(
    shownCount(reading, 'Communicating') + shownCount(reading, 'Non-Communicating'),
    METER_TOTAL,
  ).toBe(reading.total);
  expectDonutCounts('Meter Status', reading, 'Total', [
    {
      label: 'Communicating',
      count: communicating,
      percent: percentField(data, 'communicatedPercentage'),
    },
    {
      label: 'Non-Communicating',
      count: nonCommunicating,
      percent: percentField(data, 'nonCommunicatedPercentage'),
    },
  ]);
}

async expectOemDistributionCounts(metrics: Record<string, unknown>): Promise<void> {
  const slices = countEntries(section(metrics, 'oemWiseConsumer'));
  const reading = await this.donut('OEM Distribution').read();
  expect(visibleSum(reading), OEM_TOTAL).toBe(reading.total);
  expect(sumCounts(slices), OEM_TOTAL).toBe(reading.total);
  expectDonutCounts(
    'OEM Distribution',
    reading,
    'Total Meters',
    slices.map((slice) => ({ ...slice, percent: sharePercent(slice.count, sumCounts(slices)) })),
  );
}

async expectRelayStatusCounts(metrics: Record<string, unknown>): Promise<void> {
  const connection = section(metrics, 'connectionStatus');
  const connected = statusSlice(connection.cd, 'Connected');
  const disconnected = statusSlice(connection.td, 'Disconnected');
  const hidden = statusSlice(connection.pd, 'Permanently Disconnected');
  const totalMeterCount = numberField(connection, 'totalMeterCount');
  const reading = await this.donut('Relay Status Overview').read();
  const relay = this.donut('Relay Status Overview');

  expect(connected.count + disconnected.count, RELAY_TOTAL).toBe(reading.total);
  expect(
    shownCount(reading, connected.label) + shownCount(reading, disconnected.label),
    RELAY_TOTAL,
  ).toBe(reading.total);
  expect(connected.count + disconnected.count + hidden.count, 'Relay API total includes Permanently Disconnected').toBe(
    totalMeterCount,
  );
  if (hidden.count > 0) {
    expect(reading.total, 'Relay center excludes Permanently Disconnected').not.toBe(totalMeterCount);
  }
  await expect(relay.root.getByRole('button', { name: `Open ${hidden.label} details`, exact: true })).toHaveCount(0);
  expect(reading.slices.map((slice) => slice.label)).not.toContain(hidden.label);
  for (const slice of reading.slices) {
    expect(slice.percentText, `${slice.label} percent`).toMatch(/^\d+\.\d%$/);
  }
  expectDonutCounts('Relay Status Overview', reading, 'Total Meters', [
    { ...connected, percent: sharePercent(connected.count, connected.count + disconnected.count) },
    { ...disconnected, percent: sharePercent(disconnected.count, connected.count + disconnected.count) },
  ]);
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
  const expected = mergeCategories(section(metrics, 'categoryWiseConsumer'));
  const rows = await this.categories().read();
  for (const item of expected) {
    const row = rows.find((candidate) => candidate.name === item.name);
    expect(row, item.name).toBeDefined();
    if (!row || row.count === null) {
      throw new Error(`${item.name} count is empty`);
    }
    const listResponse = this.page.waitForResponse(
      (response) => categoryListMatches(response.url(), item.name) && response.ok(),
      { timeout: 60_000 },
    );
    await this.categories().open(item.name);
    const url = new URL(this.page.url());
    expect(url.pathname, item.name).toBe('/consumers/dashboard/category-distribution');
    expect(url.searchParams.get('category'), item.name).toBe(item.name);
    await expect(this.main().getByText('Category Distribution', { exact: true }).first()).toBeVisible();
    const body = (await (await listResponse).json()) as unknown;
    expect(listTotal(body), `${item.name} list total`).toBe(row.count);
    expect(await this.footerTotal(), `${item.name} footer`).toBe(row.count);
    await this.returnToDefaultDashboard();
  }
}

async expectPhaseDistributionCounts(metrics: Record<string, unknown>): Promise<void> {
  const slices = countEntries(section(metrics, 'phaseWiseConsumer'));
  const reading = await this.donut('Phase Distribution').read();
  expect(visibleSum(reading), PHASE_TOTAL).toBe(reading.total);
  expect(sumCounts(slices), PHASE_TOTAL).toBe(reading.total);
  expectDonutCounts(
    'Phase Distribution',
    reading,
    'Total Meters',
    slices.map((slice) => ({ ...slice, percent: sharePercent(slice.count, sumCounts(slices)) })),
  );
}

async expectCategoryDistributionCounts(metrics: Record<string, unknown>): Promise<CategoryRow[]> {
  const expected = mergeCategories(section(metrics, 'categoryWiseConsumer'));
  const rows = await new CategoryDistributionComponent(
    this.page,
    CategoryDistributionComponent.locate(this.main()),
  ).read();
  const shownTotal = rows.reduce((sum, row) => sum + (row.count ?? Number.NaN), 0);
  const expectedTotal = sumCounts(expected);

  console.log('Category Distribution');
  for (const row of rows) {
    const countText = row.count === null ? '—' : row.count.toLocaleString('en-US');
    console.log(`  ${row.code} - ${row.name} (${countText}) ${row.percentText}`);
  }
  console.log(`  total ${shownTotal.toLocaleString('en-US')}`);

  expect(rows.map((row) => `${row.code} - ${row.name}`), 'Category Distribution order').toEqual(
    CATEGORY_ROWS.map((row) => `${row.code} - ${row.name}`),
  );
  expect(shownTotal, 'Category Distribution total = sum of category counts').toBe(expectedTotal);

  const consumerType = unwrapData(metrics).consumerType;
  if (isRecord(consumerType) && isRecord(consumerType.totalConsumers)) {
    expect(shownTotal, 'Category Distribution total = total consumers').toBe(
      numberField(consumerType.totalConsumers, 'count'),
    );
  }

  expected.forEach((item, index) => {
    const row = rows[index];
    expect(row.count, `${item.code} count`).toBe(item.count);
    if (row.percent === null) {
      throw new Error(`${item.code} percent is empty`);
    }
    expect(row.percent, `${item.code} %`).toBeCloseTo(
      sharePercent(item.count, expectedTotal),
      decimalPlaces(row.percentText),
    );
  });

  return rows;
}
}

export type DonutTitle = 'Meter Status' | 'OEM Distribution' | 'Relay Status Overview' | 'Phase Distribution';

const METER_TOTAL = 'Meter Status total = Communicating + Non-Communicating';
const OEM_TOTAL = 'OEM Distribution total = sum of OEM counts';
const RELAY_TOTAL = 'Relay Status total = Connected + Disconnected';
const PHASE_TOTAL = 'Phase Distribution total = sum of phase counts';

const CATEGORY_ROWS: ReadonlyArray<{ code: string; name: string; aliases: string[] }> = [
  { code: 'RES', name: 'Residential', aliases: ['residential'] },
  { code: 'COM', name: 'Commercial', aliases: ['commercial'] },
  { code: 'IND', name: 'Industrial', aliases: ['industrial'] },
  { code: 'AGRI', name: 'Agriculture', aliases: ['agriculture', 'agricultural'] },
  { code: 'SCH', name: 'School', aliases: ['school', 'bhagya jyothi', 'bhagyajyothi', 'bhagya-jyothi'] },
  { code: 'SLIGHT', name: 'Street Light', aliases: ['street light', 'streetlight', 'street-light'] },
  { code: 'TEMP', name: 'Temporary', aliases: ['temporary'] },
  {
    code: 'EV',
    name: 'Electric Vehicle',
    aliases: ['electric vehicle', 'electric-vehicle', 'electric vehicle charging station', 'electricvehiclechargingstation'],
  },
  { code: 'UNKNOWN', name: 'Unknown', aliases: ['unknown'] },
];

function unwrapData(body: Record<string, unknown>): Record<string, unknown> {
  if (body.success === true && isRecord(body.data)) {
    return body.data;
  }
  return body;
}

function section(metrics: Record<string, unknown>, field: string): Record<string, unknown> {
  const value = unwrapData(metrics)[field];
  if (!isRecord(value)) {
    throw new Error(`Missing ${field} on consumer metrics. Keys: ${Object.keys(unwrapData(metrics)).join(', ')}`);
  }
  return value;
}

function numberField(record: Record<string, unknown>, field: string, aliases: string[] = []): number {
  for (const key of [field, ...aliases]) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && /^-?\d[\d,]*$/.test(value.trim())) {
      return Number(value.replace(/,/g, ''));
    }
  }
  throw new Error(`Missing ${field}. Keys: ${Object.keys(record).join(', ')}`);
}

function percentField(record: Record<string, unknown>, field: string): number {
  const value = record[field];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.replace('%', '').replace(/,/g, '').trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  throw new Error(`Missing ${field}. Keys: ${Object.keys(record).join(', ')}`);
}

function statusSlice(value: unknown, fallback: string): { label: string; count: number; refId: string } {
  if (!isRecord(value)) {
    throw new Error(`Missing ${fallback} slice`);
  }
  const label = typeof value.label === 'string' && value.label.trim() ? value.label.trim() : fallback;
  return { label, count: numberField(value, 'count'), refId: idField(value, 'connectionStatusTblRefId') };
}

function labeledEntries(
  record: Record<string, unknown>,
  refField: string,
): Array<{ label: string; count: number; refId: string }> {
  return Object.entries(record).map(([key, value]) => {
    if (!isRecord(value)) {
      throw new Error(`Entry ${key} has no count`);
    }
    const label = typeof value.label === 'string' && value.label.trim() ? value.label.trim() : key;
    return { label, count: numberField(value, 'count'), refId: idField(value, refField) };
  });
}

function idField(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  throw new Error(`Missing ${field}. Keys: ${Object.keys(record).join(', ')}`);
}

function listTotal(body: unknown): number {
  if (!isRecord(body)) {
    throw new Error('List response has no total');
  }
  const data = isRecord(body.data) ? body.data : body;
  if (typeof data.total === 'number') {
    return data.total;
  }
  if (isRecord(data.pagination) && typeof data.pagination.total === 'number') {
    return data.pagination.total;
  }
  throw new Error(`No list total. Keys: ${Object.keys(data).join(', ')}`);
}

function categoryListMatches(rawUrl: string, name: string): boolean {
  if (!rawUrl.includes('/dashboard/consumer/category-distribution')) {
    return false;
  }
  return new URL(rawUrl).searchParams.get('category') === name;
}

function mergeCategories(record: Record<string, unknown>): Array<{ code: string; name: string; count: number }> {
  const totals = new Map(CATEGORY_ROWS.map((row) => [row.code, 0]));
  const unmatched: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (!isRecord(value)) {
      throw new Error(`Category ${key} has no count`);
    }
    const label = typeof value.label === 'string' ? value.label : key;
    const match = CATEGORY_ROWS.find((row) => categoryMatches(row, key, label));
    if (!match) {
      unmatched.push(`${key} (${label}) count=${String(value.count)}`);
      continue;
    }
    totals.set(match.code, (totals.get(match.code) ?? 0) + numberField(value, 'count'));
  }
  if (unmatched.length > 0) {
    throw new Error(`No category row for ${unmatched.join('; ')}`);
  }
  return CATEGORY_ROWS.map((row) => ({ code: row.code, name: row.name, count: totals.get(row.code) ?? 0 }));
}

function categoryMatches(
  row: { code: string; name: string; aliases: string[] },
  key: string,
  label: string,
): boolean {
  const accepted = new Set([row.code, row.name, ...row.aliases].map((item) => item.toLowerCase()));
  return tokens(key).some((token) => accepted.has(token)) || tokens(label).some((token) => accepted.has(token));
}

function tokens(value: string): string[] {
  const normalized = value.trim().toLowerCase();
  const pieces = normalized.split(/\s*-\s*/).map((piece) => piece.trim()).filter((piece) => piece.length > 0);
  return [normalized, ...pieces];
}

function countEntries(record: Record<string, unknown>): Array<{ label: string; count: number }> {
  return Object.entries(record).map(([key, value]) => {
    if (!isRecord(value)) {
      throw new Error(`Entry ${key} has no count`);
    }
    const label = typeof value.label === 'string' && value.label.trim() ? value.label.trim() : key;
    return { label, count: numberField(value, 'count') };
  });
}

function sumCounts(slices: Array<{ count: number }>): number {
  return slices.reduce((sum, slice) => sum + slice.count, 0);
}

function shownCount(reading: DonutReading, label: string): number {
  const slice = reading.slices.find((item) => item.label === label);
  if (!slice || slice.count === null) {
    throw new Error(`${reading.title} is missing ${label}`);
  }
  return slice.count;
}

function visibleSum(reading: DonutReading): number {
  return reading.slices.reduce((sum, slice) => {
    if (slice.count === null) {
      throw new Error(`${reading.title} ${slice.label} count is empty`);
    }
    return sum + slice.count;
  }, 0);
}

function sharePercent(count: number, total: number): number {
  if (total === 0) {
    return 0;
  }
  return (count / total) * 100;
}

function decimalPlaces(percentText: string): number {
  const fraction = percentText.replace('%', '').split('.')[1];
  return fraction ? fraction.length : 0;
}

function expectDonutCounts(
  title: string,
  reading: DonutReading,
  centerLabel: string,
  expected: Array<{ label: string; count: number; percent: number }>,
): void {
  expect(reading.title, title).toBe(title);
  expect(reading.centerLabel, `${title} center`).toBe(centerLabel);
  if (reading.total === null) {
    throw new Error(`${title} center total is empty`);
  }

  const expectedTotal = sumCounts(expected);
  expect(reading.total, `${title} center total`).toBe(expectedTotal);
  expect([...reading.slices.map((slice) => slice.label)].sort(), `${title} slices`).toEqual(
    [...expected.map((slice) => slice.label)].sort(),
  );

  for (const item of expected) {
    const slice = reading.slices.find((candidate) => candidate.label === item.label);
    expect(slice, `${title} ${item.label}`).toBeDefined();
    const shown = slice as DonutSlice;
    expect(shown.count, `${title} ${item.label} count`).toBe(item.count);
    if (shown.percent === null) {
      throw new Error(`${title} ${item.label} percent is empty`);
    }
    expect(shown.percent, `${title} ${item.label} %`).toBeCloseTo(item.percent, decimalPlaces(shown.percentText));
  }
}
export type CardName = 'Consumers' | 'Postpaid Connections' | 'Prepaid Connections' | 'Net Metering Consumers';
export function showingTotal(page: Page): Locator {
  return page.getByText(/Showing\s+\d.*\s+of\s+/i);
}

