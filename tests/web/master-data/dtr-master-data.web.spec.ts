import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'path';
import ExcelJS from 'exceljs';
import { Route } from '@playwright/test';
import { expect, functionality, test } from '../../../src/core/fixtures/test.fixtures';
import { DtrList, DtrMasterDataPage } from '../../../src/pages/dtr-master-data.page';

const DTR_HEADERS = [
  'Zone',
  'Sub Station',
  'Feeder',
  'DTR Code',
  'DTR Name',
  'DTR Capacity (KVA)',
  'Status',
  'Meter Serial Number',
  'Main/Sub Meter',
  'Service Point ID',
  'Meter Phase',
  'Connected To DCU',
  'SIM No.',
  'IMSI No.',
  'IP Address',
  'Modem Serial Number',
  'Modem IMEI',
  'Meter Initial Reading',
  'Latitude',
  'Longitude',
  'DTR Address',
  'Remarks',
];

test.describe('DTR list @master-data @regression', () => {
  functionality('Master Data');
  test.describe.configure({ timeout: 180_000 });

  let list: DtrList;

  test.beforeEach(async ({ loginPage, data, page, app }) => {
    await loginPage.open();
    await loginPage.signIn(data.user('validAdmin'));
    await page.waitForURL(/\/consumers(?:\?|$)/, { timeout: 20_000 });
    list = await new DtrMasterDataPage(page, app).open();
  });

  test('The DTR list opens on the first page @smoke', async ({ page, app }) => {
    await expect(page).toHaveURL(/\/master-data\/dtrs(?:\?|$)/);
    await expect(page.getByText('Master Data', { exact: true }).first()).toBeVisible();
    await expect(page.locator('#dtr-master-search')).toHaveAttribute('placeholder', 'Search ...');
    const params = new URL(list.url).searchParams;
    expect(params.get('page') ?? '1').toBe('1');
    expect(params.get('limit') ?? '10').toBe('10');
    expect(params.has('q')).toBe(false);
    expect(params.has('communicationStatus')).toBe(false);
    expect(params.has('organisationLookupId')).toBe(false);
    expect(params.has('networkLookupId')).toBe(false);
    await new DtrMasterDataPage(page, app).expectFooter(list);
    await expect(page.getByRole('columnheader', { name: 'DTR Code', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Bulk Upload', exact: true })).toBeVisible();
  });

  test('Download stays unavailable while the DTR list is loading', async ({ page }) => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/dtr-master-data**', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      await gate;
      await route.continue();
    });
    await page.reload({ waitUntil: 'commit' });
    try {
      await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeDisabled({ timeout: 20_000 });
    } finally {
      release();
    }
  });

  test('Search ignores extra spaces, can be cleared, and shows nothing when there is no match', async ({ page, app }) => {
    const dtrs = new DtrMasterDataPage(page, app);
    const code = String(list.items.find((item) => String(item.dtrCode ?? '').trim())?.dtrCode ?? '').trim();
    expect(code, 'dtr code').not.toBe('');
    const found = await dtrs.searchFor(`  ${code}  `);
    expect(new URL(found.url).searchParams.get('q')).toBe(code);
    expect(found.total).toBeGreaterThan(0);
    await dtrs.expectFooter(found);
    const cleared = await dtrs.clearSearch();
    expect(new URL(cleared.url).searchParams.has('q')).toBe(false);
    await dtrs.searchFor('NO-SUCH-DTR-000');
    await expect(page.getByText('No DTR Rows')).toBeVisible();
    await expect(page.getByText(/Showing\s+1[–-]10\s+of\s+0/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeDisabled();
  });

  test('A search made only of spaces is ignored', async ({ page, app }) => {
    await new DtrMasterDataPage(page, app).expectSpacesDoNotSearch();
  });

  test('Online, Offline, and organisation filters narrow the list, and Reset clears them', async ({ page, app }) => {
    const dtrs = new DtrMasterDataPage(page, app);
    await dtrs.openFilters();
    await expect(page.getByRole('button', { name: 'Hierarchy level to search within', exact: true })).toBeDisabled();
    await expect(page.getByRole('radio', { name: 'All', exact: true })).toBeChecked();
    const online = await dtrs.applyCommunication('Online');
    expect(new URL(online.url).searchParams.get('communicationStatus')).toBe('communicating');
    expect(online.total).toBeLessThanOrEqual(list.total);
    const offline = await dtrs.applyCommunication('Offline');
    expect(new URL(offline.url).searchParams.get('communicationStatus')).toBe('non-communicating');
    const hierarchy = await dtrs.applyFirstOrganisation();
    expect(Number(new URL(hierarchy.url).searchParams.get('organisationLookupId'))).toBeGreaterThan(0);
    expect(new URL(hierarchy.url).searchParams.has('networkLookupId')).toBe(false);
    const reset = await dtrs.resetFilters();
    expect(reset.total).toBe(list.total);
  });

  test('The count at the bottom, page 2, the page size, and the last page all agree', async ({ page, app }) => {
    test.skip(list.total <= 10, 'There is only one page of DTRs');
    const dtrs = new DtrMasterDataPage(page, app);
    await dtrs.expectFooter(list);
    const pageTwo = await dtrs.goToPage(2);
    expect(new URL(pageTwo.url).searchParams.get('page')).toBe('2');
    expect(pageTwo.total).toBe(list.total);
    await dtrs.expectSerialNumber('11');
    await expect(page).not.toHaveURL(/[?&]page=/);
    const wider = await dtrs.setPageSize(20);
    expect(new URL(wider.url).searchParams.get('limit')).toBe('20');
    expect(wider.items.length).toBeLessThanOrEqual(20);
    const last = await dtrs.goToPage(Math.ceil(list.total / 20));
    await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
    expect(last.total).toBe(list.total);
  });

  test('Changing the page size from page 2 returns to the first page', async ({ page, app }) => {
    test.skip(list.total <= 10, 'There is only one page of DTRs');
    const dtrs = new DtrMasterDataPage(page, app);
    await dtrs.goToPage(2);
    const resized = await dtrs.setPageSize(50);
    expect(new URL(resized.url).searchParams.get('page') ?? '1').toBe('1');
    expect(resized.limit).toBe(50);
  });

  test('A filtered download and a download of selected DTRs both succeed', async ({ page, app }) => {
    const dtrs = new DtrMasterDataPage(page, app);
    const code = String(list.items[0]?.dtrCode ?? '').trim();
    await dtrs.searchFor(code);
    const filtered = await dtrs.downloadFiltered();
    expect(filtered.resource).toBe('dtr');
    expect(filtered.mode).toBe('filtered');
    expect((filtered.filters as Record<string, unknown>).q).toBe(code);
    expect(filtered.filters).not.toHaveProperty('page');
    await dtrs.selectRows(1);
    const selected = await dtrs.downloadSelected(1);
    expect(selected.mode).toBe('selected');
    expect(Array.isArray(selected.selectedIds) && (selected.selectedIds as unknown[]).length).toBeGreaterThan(0);
  });

  test('A failed download shows the failure message', async ({ page, app }) => {
    await new DtrMasterDataPage(page, app).expectDownloadFailure();
  });

  test('View details opens that DTR', async ({ page, app }) => {
    const row = list.items.find((item) => String(item.newDtrCode ?? item.dtrCode ?? '').trim());
    const code = String(row?.newDtrCode ?? row?.dtrCode ?? '').trim();
    expect(code, 'dtr code').not.toBe('');
    const url = await new DtrMasterDataPage(page, app).viewFirst();
    expect(decodeURIComponent(url)).toContain(`/dtr/${code}`);
  });

  test('The upload template has the right columns, and bad files are rejected', async ({ page, app }) => {
    test.setTimeout(180_000);
    const dtrs = new DtrMasterDataPage(page, app);
    const dialog = await dtrs.openBulk();
    await expect(dialog.getByText('Upload an Excel (.xlsx) file to add multiple DTR records at once.')).toBeVisible();
    await expect(dialog.getByText('DTRs_Bulk_Upload_Template.xlsx')).toBeVisible();
    const template = await dtrs.downloadTemplate();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(template);
    const headers: string[] = [];
    workbook.worksheets[0]?.getRow(1).eachCell({ includeEmpty: false }, (cell) => {
      headers.push(String(cell.text ?? cell.value ?? '').trim());
    });
    const absent = DTR_HEADERS.filter((header) => !headers.includes(header));
    expect(absent, 'required template headers').toEqual([]);
    if (headers.join('\n') !== DTR_HEADERS.join('\n')) {
      console.log(`ISSUE DMD-007: downloaded template headers are ${JSON.stringify(headers)}. Coverage requires ${JSON.stringify(DTR_HEADERS)}.`);
    }
    expect.soft(headers, 'ISSUE DMD-007 template headers differ from the required upload headers').toEqual(DTR_HEADERS);
    await page.keyboard.press('Escape');

    const dir = await mkdtemp(path.join(tmpdir(), 'dtr-'));
    const missing = path.join(dir, 'missing.xlsx');
    const empty = path.join(dir, 'empty.xlsx');
    const duplicate = path.join(dir, 'duplicate.xlsx');
    await writeSheet(missing, [DTR_HEADERS.filter((header) => header !== 'DTR Code')]);
    await writeSheet(empty, [DTR_HEADERS]);
    await writeSheet(duplicate, [[...DTR_HEADERS, 'dtr code']]);
    await dtrs.rejectWorkbook(missing, /Required columns must be present\. Missing:/);
    await dtrs.rejectWorkbook(empty, /File must contain at least one data row/);
    await dtrs.rejectWorkbook(duplicate, /Duplicate column names are not allowed:/);

    const csv = path.join(dir, 'dtrs.csv');
    const oversize = path.join(dir, 'oversize.xlsx');
    await writeFile(csv, 'not a workbook');
    await writeFile(oversize, Buffer.alloc(5 * 1024 * 1024 + 1024));
    await dtrs.rejectCsv(csv);
    await dtrs.openBulk();
    const posted = page
      .waitForRequest((request) => request.method() === 'POST' && request.url().includes('/master-data/bulk-upload-dtr'), { timeout: 2_000 })
      .then(() => true)
      .catch(() => false);
    await page.locator('#dtr-bulk-file-input').setInputFiles(oversize);
    const sizeToast = page.getByText('File size must be 5 MB or less.');
    const sizeCopy = page.getByText('File size must not exceed 5 MB.');
    await expect(sizeToast).toBeVisible();
    console.log('ISSUE DMD-007: an oversized file shows "File size must be 5 MB or less." Coverage expects "File size must not exceed 5 MB."');
    expect.soft(await sizeCopy.count(), 'ISSUE DMD-007 oversized file copy').toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: 'Validate', exact: true })).toBeDisabled();
    expect(await posted, 'an oversized file is not posted').toBe(false);
  });

  test('A failed DTR list does not show a total taken from the error', async ({ page, data }) => {
    await page.route('**/dtr-master-data**', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: data.json('payloads/mocks.json', 'pagedListFailed') }),
    );
    await page.reload();
    await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeDisabled();
    await expect(page.getByRole('checkbox', { name: /Select row / })).toHaveCount(0);
    await expect(page.getByText(/Showing\s+1[–-]10\s+of\s+0/)).toHaveCount(0);
  });
});

test('Opening the DTR list without signing in returns to the sign-in page', async ({ page, app }) => {
  await page.goto(app.routes.dtrData);
  await expect(page).toHaveURL(/\/login/);
});

test('A person who cannot view DTRs is blocked from the DTR list', async ({ loginPage, data, page, app }) => {
  const rewrite = (route: Route) => denyDtrPermission(route, (key) => key !== 'dtrs.view');
  await page.route('**/auth/login**', rewrite);
  await page.route('**/auth/me**', rewrite);
  await page.route('**/permissions/me**', rewrite);
  await loginPage.open();
  await loginPage.signIn(data.user('validAdmin'));
  await page.waitForURL(/\/consumers(?:\?|$)/, { timeout: 20_000 });
  await page.evaluate(() => {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith('rbac.permissionKeys.')) sessionStorage.removeItem(key);
    }
  });
  await page.goto(app.routes.dtrData);
  await expect(page.getByText('Access denied', { exact: true })).toBeVisible();
  const denied = (await page.getByRole('status').innerText()).replace(/\s+/g, ' ').trim();
  console.log(`ISSUE DMD-009: denied page reads "${denied}". Coverage expects title DTR Data and "You need dtrs.view to view DTR data."`);
  expect.soft(await page.getByText('DTR Data', { exact: true }).count(), 'ISSUE DMD-009 denied page title').toBeGreaterThan(0);
  expect.soft(await page.getByText('You need dtrs.view to view DTR data.').count(), 'ISSUE DMD-009 denied page copy').toBeGreaterThan(0);
  await expect(page.getByRole('row')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Bulk Upload', exact: true })).toHaveCount(0);
});

test('A person who can view DTRs but cannot create them can read the list and cannot bulk upload', async ({ loginPage, data, page, app }) => {
  const rewrite = (route: Route) => denyDtrPermission(route, (key) => key !== 'dtrs.create');
  await page.route('**/auth/login**', rewrite);
  await page.route('**/auth/me**', rewrite);
  await page.route('**/permissions/me**', rewrite);
  await loginPage.open();
  await loginPage.signIn(data.user('validAdmin'));
  await page.waitForURL(/\/consumers(?:\?|$)/, { timeout: 20_000 });
  await page.evaluate(() => {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith('rbac.permissionKeys.')) sessionStorage.removeItem(key);
    }
  });
  await page.goto(app.routes.dtrData);
  await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bulk Upload', exact: true })).toHaveCount(0);
});

async function denyDtrPermission(route: Route, keep: (key: string) => boolean): Promise<void> {
  const response = await route.fetch();
  const body: unknown = await response.json().catch(() => null);
  if (body && typeof body === 'object') {
    const root = (body as { data?: unknown }).data ?? body;
    if (root && typeof root === 'object') {
      const record = root as { isUltimate?: boolean; permissions?: unknown; user?: { roleIsUltimate?: boolean } };
      if (typeof record.isUltimate === 'boolean') record.isUltimate = false;
      if (record.user && typeof record.user.roleIsUltimate === 'boolean') record.user.roleIsUltimate = false;
      if (Array.isArray(record.permissions)) {
        record.permissions = record.permissions.filter((key) => typeof key === 'string' && keep(key));
      }
    }
  }
  await route.fulfill({ status: response.status(), contentType: 'application/json', body: JSON.stringify(body) });
}

async function writeSheet(file: string, rows: string[][]): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('DTRs');
  for (const row of rows) sheet.addRow(row);
  await workbook.xlsx.writeFile(file);
}
