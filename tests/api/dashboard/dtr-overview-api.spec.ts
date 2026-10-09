import { expect, functionality, test } from '../../../src/core/fixtures/test.fixtures';
import { ApiClient } from '../../../src/core/api/api.client';
import {
  detailsTotalSchema,
  dtrBreakdownSchema,
  dtrPointsSchema,
  dtrSummarySchema,
  loginSchema,
  masterListSchema,
  validationErrorSchema,
} from '../../../src/core/api/dashboard.schemas';
import {
  apiTotal,
  bandItems,
  detailsTotal,
  lookupIds,
  pointList,
  positiveIds,
  type PowerPoint,
} from '../../../src/core/components/dtr-overview-widgets';
import type { DataStore } from '../../../src/core/data/data.loader';
import { kolkataCalendar } from '../../../src/core/components/month-grid';
import { expectApiContract, expectAuthorizedContract, expectUnauthorized } from '../support/expect-dashboard-contract';

const LOADING_BANDS = [
  { label: 'Critical', band: 'critical', names: ['critical', 'high'] },
  { label: 'High Load', band: 'high-load', names: ['high load', 'high-load', 'medium'] },
  { label: 'Normal', band: 'normal', names: ['normal', 'low'] },
  { label: 'Under Utilized', band: 'under-utilized', names: ['under utilized', 'under-utilized', 'very low'] },
] as const;
const SEVERITIES = ['severe', 'moderate', 'balanced'] as const;

test.describe('DTR overview API @dashboard @regression', () => {
  functionality('Dashboard');
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ api, data, env }) => {
    const login = await api.authenticate(data.user('validAdmin'));
    expectApiContract(login, loginSchema, env.timeouts.api, 'login', { authorized: false, hasBody: true });
  });

  test('DOA-001 summary for the selected month, the current month, and weekly', async ({ api, data, env }) => {
    const filter = selectedFilter(data);
    const selected = await readSummary(api, env.timeouts.api, dailyQuery(filter));
    expectCards(selected);
    expect(selected.dtrsOn + selected.dtrsOff, 'ON plus OFF is not required to equal Total DTRs').toEqual(expect.any(Number));

    const current = kolkataCalendar().ym;
    const currentMonth = await readSummary(api, env.timeouts.api, { period: filter.period, monthYear: current });
    expectCards(currentMonth);

    const weekly = await readSummary(api, env.timeouts.api, { period: 'weekly', monthYear: filter.monthYear });
    expectCards(weekly);
  });

  test('DOA-002 power status covers every day of the selected month', async ({ api, data, env }) => {
    const filter = selectedFilter(data);
    const daily = await readPoints(api, env.timeouts.api, 'dtrPowerStatus', dailyQuery(filter), `${filter.monthYear} power`);
    const points = pointList(record(daily));
    expectMonthDays(points.map((point) => point.label), filter.monthYear);
    for (const point of points) {
      expect(point.onPercentage, `${point.label} on percentage`).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(point.offPercentage), `${point.label} off percentage`).toBe(true);
      expect(point.dtrsOn, `${point.label} dtrs on`).toBeGreaterThanOrEqual(0);
      expect(point.dtrsOff, `${point.label} dtrs off`).toBeGreaterThanOrEqual(0);
    }
    const weekly = await readPoints(api, env.timeouts.api, 'dtrPowerStatus', { period: 'weekly', monthYear: filter.monthYear }, 'weekly power');
    expect(pointList(record(weekly)).length, 'weekly power points').toBeGreaterThanOrEqual(0);
  });

  test('DOA-003 energy consumption covers every day of the selected month', async ({ api, data, env }) => {
    const filter = selectedFilter(data);
    const daily = await readPoints(api, env.timeouts.api, 'dtrConsumption', dailyQuery(filter), `${filter.monthYear} consumption`);
    const points = energyPoints(record(daily));
    expectMonthDays(points.map((point) => point.label), filter.monthYear);
    const sample = points.find((point) => dayLabels(filter.monthYear).includes(point.label));
    expect(sample, `${filter.monthYear} energy point`).toBeDefined();
    expect(Number.isFinite(sample?.kvah), `${sample?.label} kVAh is re-read from the response`).toBe(true);
    const weekly = await readPoints(api, env.timeouts.api, 'dtrConsumption', { period: 'weekly', monthYear: filter.monthYear }, 'weekly consumption');
    expect(Array.isArray(record(weekly).points), 'weekly consumption points').toBe(true);
  });

  test('DOA-004 communication status for the selected month and the first-paint query', async ({ api, data, env }) => {
    const filter = selectedFilter(data);
    const selected = await readBreakdown(api, env.timeouts.api, 'dtrCommunicationStatus', { monthYear: filter.monthYear }, `${filter.monthYear} communication`);
    const counts = communicationCounts(record(selected));
    expect(counts.communicating + counts.nonCommunicating, 'communication center').toBe(counts.center);
    const firstPaint = await readBreakdown(api, env.timeouts.api, 'dtrCommunicationStatus', undefined, 'communication first paint');
    communicationCounts(record(firstPaint));
  });

  test('DOA-005 percentage loading for the selected month and the first-paint query', async ({ api, data, env }) => {
    const filter = selectedFilter(data);
    const selected = await readBreakdown(api, env.timeouts.api, 'dtrPercentageLoading', { monthYear: filter.monthYear }, `${filter.monthYear} loading`);
    const bands = loadingBands(record(selected));
    expect(bands.reduce((sum, band) => sum + band.value, 0), 'loading item values').toBeGreaterThanOrEqual(0);
    const firstPaint = await readBreakdown(api, env.timeouts.api, 'dtrPercentageLoading', undefined, 'loading first paint');
    loadingBands(record(firstPaint));
  });

  test('DOA-006 load unbalance for the selected month and the first-paint query', async ({ api, data, env }) => {
    const filter = selectedFilter(data);
    const selected = await readBreakdown(api, env.timeouts.api, 'dtrLoadUnbalance', { monthYear: filter.monthYear }, `${filter.monthYear} load`);
    severityCounts(record(selected));
    const firstPaint = await readBreakdown(api, env.timeouts.api, 'dtrLoadUnbalance', undefined, 'load first paint');
    severityCounts(record(firstPaint));
  });

  test('DOA-007 voltage unbalance for the selected month and the first-paint query', async ({ api, data, env }) => {
    const filter = selectedFilter(data);
    const selected = await readBreakdown(api, env.timeouts.api, 'dtrVoltageUnbalance', { monthYear: filter.monthYear }, `${filter.monthYear} voltage`);
    severityCounts(record(selected));
    const firstPaint = await readBreakdown(api, env.timeouts.api, 'dtrVoltageUnbalance', undefined, 'voltage first paint');
    severityCounts(record(firstPaint));
  });

  test('DOA-008 each card list uses the selected month summary', async ({ api, data, env }) => {
    const filter = selectedFilter(data);
    const summary = dtrSummarySchema.parse((await api.get('dtrSummary', { query: dailyQuery(filter), expectedStatus: 200 })).body);
    const body = record(summary.data);
    cardFields(body);
    await readList(api, env.timeouts.api, { page: 1, limit: 10 }, 'total DTRs list');
    await readList(api, env.timeouts.api, { page: 1, limit: 10, metric: 'DTRs ON' }, 'DTRs ON list');
    await readList(api, env.timeouts.api, listIds(positiveIds(lookupIds(body, 'dtrsOff'))), 'DTRs OFF list');
    await readList(api, env.timeouts.api, listIds(positiveIds(lookupIds(body, 'activeAlerts'))), 'active alerts list');
  });

  test('DOA-009 power details match the clicked day and a weekly point', async ({ api, data, env }) => {
    const filter = selectedFilter(data);
    const daily = pointList(record(await readPoints(api, env.timeouts.api, 'dtrPowerStatus', dailyQuery(filter), 'power for details')));
    const point = daily.find((item) => item.dtrsOn > 0 || item.dtrsOff > 0) ?? daily[0];
    expect(point, `${filter.monthYear} power point`).toBeDefined();
    await expectPowerDetails(api, env.timeouts.api, point, filter, 'daily');
    const weekly = pointList(record(await readPoints(api, env.timeouts.api, 'dtrPowerStatus', { period: 'weekly', monthYear: filter.monthYear }, 'weekly power for details')));
    expect(weekly.length, 'a weekly power point').toBeGreaterThan(0);
    await expectPowerDetails(api, env.timeouts.api, weekly[0], filter, 'weekly');
  });

  test('DOA-010 communication details stay inside the selected month', async ({ api, data, env }) => {
    const filter = selectedFilter(data);
    communicationCounts(record(await readBreakdown(api, env.timeouts.api, 'dtrCommunicationStatus', { monthYear: filter.monthYear }, 'communication chart')));
    await readDetails(api, env.timeouts.api, 'dtrCommunicationDetails', { status: 'communicated', monthYear: filter.monthYear }, 'communicating details', filter.monthYear);
    await readDetails(api, env.timeouts.api, 'dtrCommunicationDetails', { status: 'non-communicated', monthYear: filter.monthYear }, 'non-communicating details', filter.monthYear);
  });

  test('DOA-011 percentage loading details stay inside the selected month', async ({ api, data, env }) => {
    const filter = selectedFilter(data);
    const bands = loadingBands(record(await readBreakdown(api, env.timeouts.api, 'dtrPercentageLoading', { monthYear: filter.monthYear }, 'loading chart')));
    for (const band of bands) {
      await readDetails(api, env.timeouts.api, 'dtrPercentageLoadingDetails', { band: band.band, monthYear: filter.monthYear }, `${band.label} details`, filter.monthYear);
    }
  });

  test('DOA-012 consumption details return a count for each energy kind', async ({ api, data, env }) => {
    const filter = selectedFilter(data);
    const points = energyPoints(record(await readPoints(api, env.timeouts.api, 'dtrConsumption', dailyQuery(filter), 'consumption for details')));
    const point = points.find((item) => item.kwh !== 0 || item.kvah !== 0 || item.kvarh !== 0) ?? points[0];
    expect(point, `${filter.monthYear} energy point`).toBeDefined();
    for (const kind of ['kwh', 'kvah', 'kvarh'] as const) {
      const total = await readDetails(
        api,
        env.timeouts.api,
        'dtrConsumptionDetails',
        { kind, period: filter.period, bucket: point.label, monthYear: filter.monthYear },
        `${kind} details`,
        filter.monthYear,
      );
      expect(Number.isFinite(total), `${kind} details total`).toBe(true);
    }
  });

  test('DOA-013 load unbalance details stay inside the selected month', async ({ api, data, env }) => {
    const filter = selectedFilter(data);
    await expectSeverityDetails(api, env.timeouts.api, 'dtrLoadUnbalance', 'dtrLoadUnbalanceDetails', 'load', filter.monthYear);
  });

  test('DOA-014 voltage unbalance details stay inside the selected month', async ({ api, data, env }) => {
    const filter = selectedFilter(data);
    await expectSeverityDetails(api, env.timeouts.api, 'dtrVoltageUnbalance', 'dtrVoltageUnbalanceDetails', 'voltage', filter.monthYear);
  });

  test('DOA-001 DOA-009 DOA-010 DOA-011 DOA-012 DOA-013 DOA-014 rejected queries return 400', async ({ api, env }) => {
    const checks: Array<{ endpoint: string; query: Record<string, string> }> = [
      { endpoint: 'dtrSummary', query: { period: 'bogus' } },
      { endpoint: 'dtrSummary', query: { monthYear: '2026-13' } },
      { endpoint: 'dtrPowerStatusDetails', query: { status: 'bogus' } },
      { endpoint: 'dtrCommunicationDetails', query: { status: 'bogus' } },
      { endpoint: 'dtrPercentageLoadingDetails', query: { band: 'bogus' } },
      { endpoint: 'dtrConsumptionDetails', query: { kind: 'bogus' } },
      { endpoint: 'dtrLoadUnbalanceDetails', query: { severity: 'bogus' } },
      { endpoint: 'dtrVoltageUnbalanceDetails', query: { severity: 'bogus' } },
    ];
    for (const check of checks) {
      const result = await api.get(check.endpoint, { query: check.query, expectedStatus: 400 });
      expectApiContract(result, validationErrorSchema, env.timeouts.api, `invalid ${check.endpoint}`, { status: 400 });
    }
  });
});

test.describe('DTR overview API security @dashboard @regression', () => {
  functionality('Dashboard');
  test.describe.configure({ timeout: 180_000 });

  test('DOA-015 every DTR overview read rejects a missing token and a bad bearer', async ({ request, app, env }) => {
    const anonymous = new ApiClient(request, app, env);
    const reads = [
      'dtrSummary',
      'dtrPowerStatus',
      'dtrConsumption',
      'dtrCommunicationStatus',
      'dtrPercentageLoading',
      'dtrLoadUnbalance',
      'dtrVoltageUnbalance',
      'dtrMasterData',
      'dtrPowerStatusDetails',
      'dtrCommunicationDetails',
      'dtrPercentageLoadingDetails',
      'dtrConsumptionDetails',
      'dtrLoadUnbalanceDetails',
      'dtrVoltageUnbalanceDetails',
    ];
    for (const endpoint of reads) {
      const missing = await anonymous.get(endpoint, { expectedStatus: 401 });
      expectUnauthorized(missing, env.timeouts.api, `${endpoint} missing token`);
      const forged = await anonymous.get(endpoint, {
        headers: { Authorization: 'Bearer not-a-token' },
        expectedStatus: 401,
      });
      expectUnauthorized(forged, env.timeouts.api, `${endpoint} bad bearer`, { sentToken: true });
    }
  });
});

async function readSummary(api: ApiClient, limitMs: number, query: Record<string, string>): Promise<CardCounts> {
  const body = expectAuthorizedContract(await api.get('dtrSummary', { query, expectedStatus: 200 }), dtrSummarySchema, limitMs, `summary ${query.period} ${query.monthYear}`);
  return cardFields(record(body.data));
}

async function readPoints(api: ApiClient, limitMs: number, endpoint: string, query: Record<string, string>, label: string): Promise<unknown> {
  const body = expectAuthorizedContract(await api.get(endpoint, { query, expectedStatus: 200 }), dtrPointsSchema, limitMs, label);
  return body.data;
}

async function readBreakdown(api: ApiClient, limitMs: number, endpoint: string, query: Record<string, string> | undefined, label: string): Promise<unknown> {
  const body = expectAuthorizedContract(await api.get(endpoint, { query, expectedStatus: 200 }), dtrBreakdownSchema, limitMs, label);
  return body.data;
}

async function readList(api: ApiClient, limitMs: number, query: Record<string, string | number>, label: string): Promise<number> {
  const result = await api.get('dtrMasterData', { query, expectedStatus: 200 });
  const body = expectAuthorizedContract(result, masterListSchema, limitMs, label);
  return body.data.pagination.total;
}

async function readDetails(api: ApiClient, limitMs: number, endpoint: string, query: Record<string, string>, label: string, monthYear: string): Promise<number> {
  const result = await api.get(endpoint, { query, expectedStatus: 200 });
  expectAuthorizedContract(result, detailsTotalSchema, limitMs, label);
  expect(new URL(result.url).searchParams.get('monthYear'), `${label} month`).toBe(monthYear);
  expectDatesInMonth(result.body, monthYear, label);
  return detailsTotal(result.body);
}

async function expectPowerDetails(api: ApiClient, limitMs: number, point: PowerPoint, filter: MonthFilter, period: 'daily' | 'weekly'): Promise<void> {
  const shared = { period, bucket: point.label, monthYear: filter.monthYear };
  await readDetails(api, limitMs, 'dtrPowerStatusDetails', { status: 'on', ...shared }, `${period} ${point.label} power on`, filter.monthYear);
  if (period === 'daily') {
    await readDetails(api, limitMs, 'dtrPowerStatusDetails', { status: 'off', ...shared }, `${period} ${point.label} power off`, filter.monthYear);
  }
}

async function expectSeverityDetails(api: ApiClient, limitMs: number, chart: string, details: string, label: string, monthYear: string): Promise<void> {
  severityCounts(record(await readBreakdown(api, limitMs, chart, { monthYear }, `${label} chart`)));
  for (const severity of SEVERITIES) {
    await readDetails(api, limitMs, details, { severity, monthYear }, `${label} ${severity}`, monthYear);
  }
}

interface MonthFilter {
  monthYear: string;
  period: string;
}

function selectedFilter(data: DataStore): MonthFilter {
  const filter = data.payload<MonthFilter>('payloads/dtr-overview.json', 'selectedMonth');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(filter.monthYear)) {
    throw new Error(`selectedMonth.monthYear must be YYYY-MM. Received ${filter.monthYear}`);
  }
  return filter;
}

function dailyQuery(filter: MonthFilter): Record<string, string> {
  return { period: filter.period, monthYear: filter.monthYear };
}

interface CardCounts {
  totalDtrs: number;
  dtrsOn: number;
  dtrsOff: number;
  activeAlerts: number;
}

function cardFields(data: Record<string, unknown>): CardCounts {
  return {
    totalDtrs: finiteCount(data, 'totalDtrs'),
    dtrsOn: finiteCount(data, 'dtrsOn'),
    dtrsOff: finiteCount(data, 'dtrsOff'),
    activeAlerts: finiteCount(data, 'activeAlerts'),
  };
}

function expectCards(cards: CardCounts): void {
  for (const [name, count] of Object.entries(cards)) {
    expect(Number.isFinite(count), `${name} count`).toBe(true);
  }
}

function finiteCount(data: Record<string, unknown>, key: string): number {
  const node = data[key];
  const count = isRecord(node) ? node.count : undefined;
  if (typeof count !== 'number' || !Number.isFinite(count)) {
    throw new Error(`${key}.count is not a finite number`);
  }
  return count;
}

function dayLabels(monthYear: string): string[] {
  const [year, month] = monthYear.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const short = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1];
  return Array.from({ length: last }, (_, index) => `${index + 1} ${short}`);
}

function monthBounds(monthYear: string): { start: string; end: string } {
  const [year, month] = monthYear.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const padded = String(month).padStart(2, '0');
  return { start: `${year}-${padded}-01`, end: `${year}-${padded}-${String(last).padStart(2, '0')}` };
}

function expectDatesInMonth(body: unknown, monthYear: string, label: string): void {
  const bounds = monthBounds(monthYear);
  const outside = collectDates(body).filter((date) => date < bounds.start || date > bounds.end);
  expect(outside, `${label} stays in ${monthYear}`).toEqual([]);
}

function collectDates(value: unknown, found: string[] = []): string[] {
  if (typeof value === 'string') {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
    if (match) {
      found.push(match[1]);
    }
    return found;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectDates(item, found);
    }
    return found;
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) {
      collectDates(item, found);
    }
  }
  return found;
}

function expectMonthDays(labels: string[], monthYear: string): void {
  const present = new Set(labels);
  const expected = dayLabels(monthYear);
  const missing = expected.filter((label) => !present.has(label));
  expect(missing, `${monthYear} days`).toEqual([]);
  expect(labels.length, 'the daily series is longer than a 12-point window').toBeGreaterThan(12);
}

function energyPoints(data: Record<string, unknown>): Array<{ label: string; kwh: number; kvah: number; kvarh: number }> {
  const source = Array.isArray(data.points) ? data.points.filter(isRecord) : [];
  return source.map((point) => ({
    label: String(point.label ?? ''),
    kwh: presentFinite(point, 'kwh'),
    kvah: presentFinite(point, 'kvah'),
    kvarh: presentFinite(point, 'kvarh'),
  }));
}

function presentFinite(point: Record<string, unknown>, field: string): number {
  const value = point[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} is missing on ${String(point.label)}`);
  }
  return value;
}

function communicationCounts(data: Record<string, unknown>): { communicating: number; nonCommunicating: number; center: number } {
  const items = bandItems(data);
  const communicating = namedItem(items, ['communicating', 'communicated']) ?? looseCount(data, ['communicating', 'communicated', 'communicatingCount', 'communicatedCount']);
  const nonCommunicating = namedItem(items, ['non-communicating', 'non communicating', 'noncommunicating']) ?? looseCount(data, ['nonCommunicating', 'nonCommunicated', 'non_communicating', 'nonCommunicatingCount']);
  const summed = communicating + nonCommunicating;
  const reported = apiTotal(data);
  if (reported > 0) {
    expect(reported, 'communication center').toBe(summed);
  }
  return { communicating, nonCommunicating, center: summed };
}

function loadingBands(data: Record<string, unknown>): Array<{ label: string; band: string; value: number }> {
  const items = bandItems(data);
  return LOADING_BANDS.map((band) => {
    const value = namedItem(items, [...band.names]);
    if (value === undefined) {
      throw new Error(`Missing ${band.label}. Labels: ${items.map((item) => item.label).join(', ') || 'none'}`);
    }
    expect(value, band.label).toBeGreaterThanOrEqual(0);
    return { label: band.label, band: band.band, value };
  });
}

function severityCounts(data: Record<string, unknown>): Record<(typeof SEVERITIES)[number], number> {
  const items = bandItems(data);
  const counts = {} as Record<(typeof SEVERITIES)[number], number>;
  for (const severity of SEVERITIES) {
    const value = namedItem(items, [severity]);
    if (value === undefined) {
      throw new Error(`Missing ${severity}. Labels: ${items.map((item) => item.label).join(', ') || 'none'}`);
    }
    expect(value, severity).toBeGreaterThanOrEqual(0);
    counts[severity] = value;
  }
  const summed = SEVERITIES.reduce((sum, severity) => sum + counts[severity], 0);
  const reported = apiTotal(data);
  expect(reported > 0 ? reported : summed, 'unbalance center').toBeGreaterThanOrEqual(0);
  return counts;
}

function namedItem(items: Array<{ label: string; value: number }>, names: string[]): number | undefined {
  const match = items.find((item) => names.includes(item.label.trim().toLowerCase()));
  return match?.value;
}

function looseCount(data: Record<string, unknown>, keys: string[]): number {
  const points = Array.isArray(data.points) ? data.points.filter(isRecord) : [];
  const sources = [...points].reverse();
  sources.push(data);
  for (const source of sources) {
    for (const key of keys) {
      if (typeof source[key] === 'number' && Number.isFinite(source[key])) {
        return source[key] as number;
      }
    }
  }
  throw new Error(`No count for ${keys[0]}. Keys: ${Object.keys(data).join(', ')}`);
}

function listIds(ids: number[]): Record<string, string | number> {
  return { page: 1, limit: 10, selectedIds: ids.join(',') };
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error('Expected a JSON object');
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
