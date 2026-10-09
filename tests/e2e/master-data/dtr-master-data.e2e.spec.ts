import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import type { Page } from '@playwright/test';
import { expect, functionality, test } from '../../../src/core/fixtures/test.fixtures';
import { ApiClient } from '../../../src/core/api/api.client';
import { dtrMasterListSchema } from '../../../src/core/api/dashboard.schemas';
import { DtrMasterDataPage, type DtrList } from '../../../src/pages/dtr-master-data.page';
import type { ExportPayload } from '../../../src/core/data/dataset.types';

const openQuery = { page: '1', limit: '10' };

test.describe('DTR Data UI against the API @master-data @regression', () => {
  functionality('Master Data');
  test.describe.configure({ timeout: 240_000 });

  test('the footer matches pagination.total for the open list and each communication filter @smoke', async ({
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
    const dtrs = new DtrMasterDataPage(page, app);
    const open = await dtrs.open();
    expect(openQueryMatches(open.url), open.url).toBe(true);
    expect(open.total, 'unfiltered footer').toBe(await apiTotal(api, env.timeouts.api, open.url));
    await dtrs.expectFooter(open);

    const online = await dtrs.applyCommunication('Online');
    expect(new URL(online.url).searchParams.get('communicationStatus')).toBe('communicating');
    expect(online.total, 'online footer').toBe(await apiTotal(api, env.timeouts.api, online.url));
    await dtrs.expectFooter(online);
    await dtrs.resetFilters();

    const offline = await dtrs.applyCommunication('Offline');
    expect(new URL(offline.url).searchParams.get('communicationStatus')).toBe('non-communicating');
    expect(offline.total, 'offline footer').toBe(await apiTotal(api, env.timeouts.api, offline.url));
    await dtrs.expectFooter(offline);
  });

  test('a filtered download has one workbook row per filtered DTR', async ({ loginPage, api, data, page, app, env }) => {
    await api.authenticate(data.user('validAdmin'));
    await loginPage.open();
    await loginPage.signIn(data.user('validAdmin'));
    await page.waitForURL(/\/consumers(?:\?|$)/, { timeout: 20_000 });
    const dtrs = new DtrMasterDataPage(page, app);
    const open = await dtrs.open();
    const code = codeFrom(open);
    const found = await dtrs.searchFor(code);
    expect(new URL(found.url).searchParams.get('q')).toBe(code);
    expect(found.total, 'search footer').toBe(await apiTotal(api, env.timeouts.api, found.url));
    const downloaded = await captureDownload(page, () => dtrs.downloadFiltered());
    const expected = data.payload<ExportPayload>('payloads/exports.json', 'dtrDownload');
    expected.filters.q = code;
    expect(downloaded.payload).toMatchObject({
      resource: expected.resource,
      mode: expected.mode,
      filters: expected.filters,
    });
    expect(await workbookDataRows(downloaded.bytes), 'workbook data rows').toBe(found.total);
  });
});

async function apiTotal(api: ApiClient, timeout: number, listUrl: string): Promise<number> {
  const body = await api.getParsed('dtrMasterData', dtrMasterListSchema, {
    query: queryFrom(listUrl),
    timeout,
  });
  return body.data.pagination.total;
}

function queryFrom(listUrl: string): Record<string, string> {
  return Object.fromEntries(new URL(listUrl).searchParams);
}

function openQueryMatches(url: string): boolean {
  const params = new URL(url).searchParams;
  return (
    (params.get('page') ?? openQuery.page) === openQuery.page &&
    (params.get('limit') ?? openQuery.limit) === openQuery.limit &&
    !params.has('q') &&
    !params.has('communicationStatus') &&
    !params.has('organisationLookupId') &&
    !params.has('networkLookupId')
  );
}

function codeFrom(list: DtrList): string {
  for (const item of list.items) {
    const code = String(item.newDtrCode ?? item.dtrCode ?? item.meterSerialNumber ?? '').trim();
    if (code) return code;
  }
  throw new Error('The DTR list has no code to search');
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
  if (!saved) throw new Error('DTR download has no local path');
  return { payload: request.postDataJSON() as Record<string, unknown>, bytes: await readFile(saved) };
}

async function workbookDataRows(bytes: Buffer): Promise<number> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);
  let rows = 0;
  workbook.worksheets[0]?.eachRow({ includeEmpty: false }, () => {
    rows += 1;
  });
  return rows - 1;
}
