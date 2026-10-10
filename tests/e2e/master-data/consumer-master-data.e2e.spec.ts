import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import type { Page } from '@playwright/test';
import { expect, functionality, test } from '../../../src/core/fixtures/test.fixtures';
import { ApiClient } from '../../../src/core/api/api.client';
import { masterListSchema } from '../../../src/core/api/dashboard.schemas';
import { ConsumerMasterDataPage } from '../../../src/pages/consumer-master-data.page';
import { totalCount } from '../../api/support/expect-dashboard-contract';

test.describe('Consumer list on screen matches the server @master-data @regression', () => {
  functionality('Master Data');
  test.describe.configure({ timeout: 240_000 });

  test('The count at the bottom matches the server for the open list and for each meter type and communication filter @smoke', async ({
    loginPage,
    api,
    data,
    page,
    app,
    env,
  }) => {
    await api.authenticate(data.user('validAdmin'));
    await loginPage.open();
    await loginPage.signIn(data.user('validAdmin'));
    await page.waitForURL(/\/consumers(?:\?|$)/, { timeout: 20_000 });
    const consumers = new ConsumerMasterDataPage(page, app);
    const open = await consumers.open();
    expect(openQueryMatches(open.url), open.url).toBe(true);
    expect(open.total, 'unfiltered footer').toBe(await apiTotal(api, env.timeouts.api, open.url));
    await consumers.expectTotal(open.total);

    const live = await consumers.applyMeterType('Live Meters', 'live');
    expect(new URL(live.url).searchParams.get('meterType')).toBe('live');
    expect(live.total, 'live footer').toBe(await apiTotal(api, env.timeouts.api, live.url));
    await consumers.resetFilters();

    const testMeters = await consumers.applyMeterType('Test Meters', 'test');
    expect(new URL(testMeters.url).searchParams.get('meterType')).toBe('test');
    expect(testMeters.total, 'test footer').toBe(await apiTotal(api, env.timeouts.api, testMeters.url));
    await consumers.resetFilters();

    const online = await consumers.applyCommunication('Online', 'communicating');
    expect(new URL(online.url).searchParams.get('communicationStatus')).toBe('communicating');
    expect(online.total, 'online footer').toBe(await apiTotal(api, env.timeouts.api, online.url));
    await consumers.expectTotal(online.total);
    await consumers.resetFilters();

    const offline = await consumers.applyCommunication('Offline', 'non-communicating');
    expect(new URL(offline.url).searchParams.get('communicationStatus')).toBe('non-communicating');
    expect(offline.total, 'offline footer').toBe(await apiTotal(api, env.timeouts.api, offline.url));
    await consumers.expectTotal(offline.total);
  });

  test('A filtered download has one Excel row for each filtered consumer', async ({ loginPage, api, data, page, app, env }) => {
    await api.authenticate(data.user('validAdmin'));
    await loginPage.open();
    await loginPage.signIn(data.user('validAdmin'));
    await page.waitForURL(/\/consumers(?:\?|$)/, { timeout: 20_000 });
    const consumers = new ConsumerMasterDataPage(page, app);
    const open = await consumers.open();
    const serial = consumers.identityFrom(open).serialNo;
    const found = await consumers.searchFor(serial);
    expect(new URL(found.url).searchParams.get('q')).toBe(serial);
    expect(found.total, 'search footer').toBe(await apiTotal(api, env.timeouts.api, found.url));
    await consumers.expectTotal(found.total);
    const downloaded = await captureDownload(page, () => consumers.downloadFiltered());
    const filters = downloaded.payload.filters as Record<string, unknown>;
    expect(downloaded.payload.resource).toBe('consumer');
    expect(downloaded.payload.mode).toBe('filtered');
    expect(filters.q).toBe(serial);
    const sheet = await workbookRows(downloaded.bytes);
    expect(sheet.reportedTotal, 'workbook total records').toBe(found.total);
    expect(sheet.dataRows, 'workbook data rows').toBe(found.total);
  });
});

async function apiTotal(api: ApiClient, timeout: number, listUrl: string): Promise<number> {
  const body = await api.getParsed('consumerMasterData', masterListSchema, {
    query: queryFrom(listUrl),
    timeout,
  });
  return totalCount(body.data, 'consumer list');
}

function queryFrom(listUrl: string): Record<string, string> {
  return Object.fromEntries(new URL(listUrl).searchParams);
}

function openQueryMatches(url: string): boolean {
  const params = new URL(url).searchParams;
  return (
    params.get('meterType') === 'all' &&
    (params.get('limit') ?? '10') === '10' &&
    (params.get('page') ?? '1') === '1' &&
    !params.has('q') &&
    !params.has('communicationStatus')
  );
}

async function captureDownload(
  page: Page,
  click: () => Promise<unknown>,
): Promise<{ payload: Record<string, unknown>; bytes: Buffer }> {
  const downloadPromise = page.waitForEvent('download', { timeout: 180_000 });
  const requestPromise = page.waitForRequest(
    (request: { method: () => string; url: () => string }) =>
      request.method() === 'POST' && request.url().includes('/master-data/export'),
    { timeout: 180_000 },
  );
  await click();
  const request = await requestPromise;
  const file = await downloadPromise;
  const saved = await file.path();
  if (!saved) throw new Error('Consumer download has no local path');
  return { payload: request.postDataJSON() as Record<string, unknown>, bytes: await readFile(saved) };
}

async function workbookRows(bytes: Buffer): Promise<{ dataRows: number; reportedTotal: number }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);
  const sheet = workbook.worksheets[0];
  let header = 0;
  let last = 0;
  let reportedTotal = Number.NaN;
  sheet?.eachRow({ includeEmpty: false }, (row, index) => {
    const label = cellText(row.getCell(1).value);
    const value = cellText(row.getCell(2).value);
    if (label === 'Total Records') reportedTotal = Number(value.replace(/,/g, ''));
    if (label === 'S.No' || label === 'Sl.No.') header = index;
    last = index;
  });
  return { dataRows: header > 0 ? last - header : 0, reportedTotal };
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (typeof value === 'object' && 'text' in value) return String(value.text).trim();
  return String(value).trim();
}
