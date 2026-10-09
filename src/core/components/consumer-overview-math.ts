import { expect, Locator, Page } from '@playwright/test';
import {
  CategoryDistributionComponent,
  type CategoryRow,
} from './category-distribution.component';
import { DonutComponent, type DonutReading, type DonutSlice } from './donut.component';
import { expectFutureMonthsDisabled, kolkataCalendar, openMonthGrid, pickMonth, previousMonth } from './month-grid';
import { isRecord } from '../utils/guards';

export type DonutTitle = 'Meter Status' | 'OEM Distribution' | 'Relay Status Overview' | 'Phase Distribution';

export const METER_TOTAL = 'Meter Status total = Communicating + Non-Communicating';
export const OEM_TOTAL = 'OEM Distribution total = sum of OEM counts';
export const RELAY_TOTAL = 'Relay Status total = Connected + Disconnected';
export const PHASE_TOTAL = 'Phase Distribution total = sum of phase counts';

export const CATEGORY_ROWS: ReadonlyArray<{ code: string; name: string; aliases: string[] }> = [
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

export function unwrapData(body: Record<string, unknown>): Record<string, unknown> {
  if (body.success === true && isRecord(body.data)) {
    return body.data;
  }
  return body;
}

export function section(metrics: Record<string, unknown>, field: string): Record<string, unknown> {
  const value = unwrapData(metrics)[field];
  if (!isRecord(value)) {
    throw new Error(`Missing ${field} on consumer metrics. Keys: ${Object.keys(unwrapData(metrics)).join(', ')}`);
  }
  return value;
}

export function numberField(record: Record<string, unknown>, field: string, aliases: string[] = []): number {
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

export function percentField(record: Record<string, unknown>, field: string): number {
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

export function statusSlice(value: unknown, fallback: string): { label: string; count: number; refId: string } {
  if (!isRecord(value)) {
    throw new Error(`Missing ${fallback} slice`);
  }
  const label = typeof value.label === 'string' && value.label.trim() ? value.label.trim() : fallback;
  return { label, count: numberField(value, 'count'), refId: idField(value, 'connectionStatusTblRefId') };
}

export function labeledEntries(
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

export function idField(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  throw new Error(`Missing ${field}. Keys: ${Object.keys(record).join(', ')}`);
}

export function listTotal(body: unknown): number {
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

export function categoryListMatches(rawUrl: string, name: string): boolean {
  if (!rawUrl.includes('/dashboard/consumer/category-distribution')) {
    return false;
  }
  return new URL(rawUrl).searchParams.get('category') === name;
}

export function mergeCategories(record: Record<string, unknown>): Array<{ code: string; name: string; count: number }> {
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

export function categoryMatches(
  row: { code: string; name: string; aliases: string[] },
  key: string,
  label: string,
): boolean {
  const accepted = new Set([row.code, row.name, ...row.aliases].map((item) => item.toLowerCase()));
  return tokens(key).some((token) => accepted.has(token)) || tokens(label).some((token) => accepted.has(token));
}

export function tokens(value: string): string[] {
  const normalized = value.trim().toLowerCase();
  const pieces = normalized.split(/\s*-\s*/).map((piece) => piece.trim()).filter((piece) => piece.length > 0);
  return [normalized, ...pieces];
}

export function countEntries(record: Record<string, unknown>): Array<{ label: string; count: number }> {
  return Object.entries(record).map(([key, value]) => {
    if (!isRecord(value)) {
      throw new Error(`Entry ${key} has no count`);
    }
    const label = typeof value.label === 'string' && value.label.trim() ? value.label.trim() : key;
    return { label, count: numberField(value, 'count') };
  });
}

export function sumCounts(slices: Array<{ count: number }>): number {
  return slices.reduce((sum, slice) => sum + slice.count, 0);
}

export function shownCount(reading: DonutReading, label: string): number {
  const slice = reading.slices.find((item) => item.label === label);
  if (!slice || slice.count === null) {
    throw new Error(`${reading.title} is missing ${label}`);
  }
  return slice.count;
}

export function visibleSum(reading: DonutReading): number {
  return reading.slices.reduce((sum, slice) => {
    if (slice.count === null) {
      throw new Error(`${reading.title} ${slice.label} count is empty`);
    }
    return sum + slice.count;
  }, 0);
}

export function sharePercent(count: number, total: number): number {
  if (total === 0) {
    return 0;
  }
  return (count / total) * 100;
}

export function decimalPlaces(percentText: string): number {
  const fraction = percentText.replace('%', '').split('.')[1];
  return fraction ? fraction.length : 0;
}

export function expectDonutCounts(
  title: string,
  reading: DonutReading,
  centerLabel: string,
  expected: Array<{ label: string; count: number; percent: number }>,
  percentPlaces: number,
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
    expect(shown.percent, `${title} ${item.label} %`).toBeCloseTo(item.percent, percentPlaces);
  }
}
export type CardName = 'Consumers' | 'Postpaid Connections' | 'Prepaid Connections' | 'Net Metering Consumers';
export function showingTotal(page: Page): Locator {
  return page.getByText(/Showing\s+\d.*\s+of\s+/i);
}

export type ConsumerOverviewHost = {
  page: Page;
  main(): Locator;
  textOf(locator: Locator): Promise<string>;
  card(name: CardName): Promise<Locator>;
  period(): Promise<Locator>;
  donut(title: DonutTitle): DonutComponent;
  categories(): CategoryDistributionComponent;
  cardCount(name: CardName): Promise<number>;
  footerTotal(): Promise<number>;
  returnToDefaultDashboard(): Promise<void>;
};

export async function expectCardFooters(host: ConsumerOverviewHost, metrics: Record<string, unknown>): Promise<void> {
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
    const text = await host.textOf(await host.card(card.name));
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

export function expectPrepaidPlusPostpaid(metrics: Record<string, unknown>): void {
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

export async function expectMonthFilters(host: ConsumerOverviewHost): Promise<Record<string, unknown>> {
  const current = kolkataCalendar();
  const past = previousMonth(current);
  const button = await host.period();
  await expect(button, 'present month').toContainText(current.label);

  const open = await openMonthGrid(host.page, button);
  await expectFutureMonthsDisabled(open, current);
  const pastResponse = host.page
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
  return unwrapData((await pastResult.json()) as Record<string, unknown>);
}

export async function expectCardDrillDowns(host: ConsumerOverviewHost, metrics: Record<string, unknown>): Promise<void> {
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
    expect(await host.cardCount(card.name), card.name).toBe(count);

    const listResponse = host.page.waitForResponse(
      (response) => response.url().includes('/master-data/consumer-master-data') && response.ok(),
      { timeout: 60_000 },
    );
    const link = await host.card(card.name);
    await link.scrollIntoViewIfNeeded();
    await link.click();

    const url = new URL(host.page.url());
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
    expect(await host.footerTotal(), `${card.name} footer`).toBe(count);
    await host.returnToDefaultDashboard();
  }
}

export async function expectMeterStatusCounts(host: ConsumerOverviewHost, meter: Record<string, unknown>): Promise<void> {
  const unavailable = host.main().getByTestId('consumer-meter-status-data-unavailable');
  if ((await unavailable.count()) > 0) {
    await expect(unavailable).toBeVisible();
    return;
  }

  const data = unwrapData(meter);
  const total = numberField(data, 'totalConsumerMeters', ['totalMeterCount']);
  const communicating = numberField(data, 'communicatedConsumerMeters');
  const nonCommunicating = numberField(data, 'nonCommunicatedConsumerMeters');
  expect(communicating + nonCommunicating, METER_TOTAL).toBe(total);

  const reading = await host.donut('Meter Status').read();
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
  ], 2);
}

export async function expectOemDistributionCounts(host: ConsumerOverviewHost, metrics: Record<string, unknown>): Promise<void> {
  const slices = countEntries(section(metrics, 'oemWiseConsumer'));
  const reading = await host.donut('OEM Distribution').read();
  expect(visibleSum(reading), OEM_TOTAL).toBe(reading.total);
  expect(sumCounts(slices), OEM_TOTAL).toBe(reading.total);
  expectDonutCounts(
    'OEM Distribution',
    reading,
    'Total Meters',
    slices.map((slice) => ({ ...slice, percent: sharePercent(slice.count, sumCounts(slices)) })),
    1,
  );
}

export async function expectRelayStatusCounts(host: ConsumerOverviewHost, metrics: Record<string, unknown>): Promise<void> {
  const connection = section(metrics, 'connectionStatus');
  const connected = statusSlice(connection.cd, 'Connected');
  const disconnected = statusSlice(connection.td, 'Disconnected');
  const hidden = statusSlice(connection.pd, 'Permanently Disconnected');
  const totalMeterCount = numberField(connection, 'totalMeterCount');
  const reading = await host.donut('Relay Status Overview').read();
  const relay = host.donut('Relay Status Overview');

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
  ], 1);
}

export async function expectCategoryDrillDowns(host: ConsumerOverviewHost, metrics: Record<string, unknown>): Promise<void> {
  const expected = mergeCategories(section(metrics, 'categoryWiseConsumer'));
  const rows = await host.categories().read();
  for (const item of expected) {
    const row = rows.find((candidate) => candidate.name === item.name);
    expect(row, item.name).toBeDefined();
    if (!row || row.count === null) {
      throw new Error(`${item.name} count is empty`);
    }
    const listResponse = host.page.waitForResponse(
      (response) => categoryListMatches(response.url(), item.name) && response.ok(),
      { timeout: 60_000 },
    );
    await host.categories().open(item.name);
    const url = new URL(host.page.url());
    expect(url.pathname, item.name).toBe('/consumers/dashboard/category-distribution');
    expect(url.searchParams.get('category'), item.name).toBe(item.name);
    await expect(host.main().getByText('Category Distribution', { exact: true }).first()).toBeVisible();
    const body = (await (await listResponse).json()) as unknown;
    expect(listTotal(body), `${item.name} list total`).toBe(row.count);
    expect(await host.footerTotal(), `${item.name} footer`).toBe(row.count);
    await host.returnToDefaultDashboard();
  }
}

export async function expectPhaseDistributionCounts(host: ConsumerOverviewHost, metrics: Record<string, unknown>): Promise<void> {
  const slices = countEntries(section(metrics, 'phaseWiseConsumer'));
  const reading = await host.donut('Phase Distribution').read();
  expect(visibleSum(reading), PHASE_TOTAL).toBe(reading.total);
  expect(sumCounts(slices), PHASE_TOTAL).toBe(reading.total);
  expectDonutCounts(
    'Phase Distribution',
    reading,
    'Total Meters',
    slices.map((slice) => ({ ...slice, percent: sharePercent(slice.count, sumCounts(slices)) })),
    1,
  );
}

export async function expectCategoryDistributionCounts(
  host: ConsumerOverviewHost,
  metrics: Record<string, unknown>,
): Promise<CategoryRow[]> {
  const expected = mergeCategories(section(metrics, 'categoryWiseConsumer'));
  const rows = await new CategoryDistributionComponent(
    host.page,
    CategoryDistributionComponent.locate(host.main()),
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

