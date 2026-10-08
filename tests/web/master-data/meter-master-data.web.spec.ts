import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'path';
import ExcelJS from 'exceljs';
import { Route } from '@playwright/test';
import { expect, functionality, test } from '../../../src/core/fixtures/test.fixtures';
import { MeterList, MeterMasterDataPage } from '../../../src/pages/meter-master-data.page';
import { METER_TEMPLATE_HEADERS, meterCells, writeMeterSheet } from '../../support/meter-workbook';

test.describe('Meter Data @master-data @regression', () => {
  functionality('Master Data');
  test.describe.configure({ timeout: 180_000 });

  let list: MeterList;

  test.beforeEach(async ({ loginPage, data, page, app }) => {
    await loginPage.open();
    await loginPage.signIn(data.user('validAdmin'));
    await page.waitForURL(/\/consumers(?:\?|$)/, { timeout: 20_000 });
    list = await new MeterMasterDataPage(page, app).open();
  });

  test('MMD-001 Meter Data opens on the first page @smoke', async ({ page, app }) => {
    await new MeterMasterDataPage(page, app).expectShell(list);
  });

  test('MMD-001 Download is disabled while the list is loading', async ({ page }) => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/meters-data**', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      await gate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { columns: [], rows: [], pagination: { page: 1, limit: 10, total: 1, totalPages: 1 } },
        }),
      });
    });
    await page.reload({ waitUntil: 'commit' });
    try {
      await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeDisabled({ timeout: 20_000 });
    } finally {
      release();
    }
  });

  test('MMD-002 and MMD-090 search, trim, clear, and a search that keeps the filter', async ({ page, app }) => {
    const meters = new MeterMasterDataPage(page, app);
    const serial = meters.serialFrom(list);
    const found = await meters.expectDebounced(`  ${serial}  `);
    await meters.expectSearchMatches(found, serial);
    const modem = meters.modemFrom(list);
    if (modem) {
      const byModem = await meters.searchFor(modem);
      await meters.expectSearchMatches(byModem, modem);
    } else {
      console.log('ISSUE MMD-002: the first page has no modem serial, so modem search was not run in the browser.');
    }
    const filtered = await meters.applyConnection('DTR');
    await meters.expectApplied(1);
    const kept = await meters.searchFor(serial);
    const params = new URL(kept.url).searchParams;
    expect(params.get('q')).toBe(serial);
    expect(params.get('connection')).toBe('dtr');
    expect(kept.total).toBeLessThanOrEqual(filtered.total);
    const cleared = await meters.clearSearch();
    expect(new URL(cleared.url).searchParams.has('q')).toBe(false);
    expect(new URL(cleared.url).searchParams.get('connection')).toBe('dtr');
  });

  test('MMD-002 a single match hides the pager and a miss shows the empty text', async ({ page, app }) => {
    const meters = new MeterMasterDataPage(page, app);
    const serial = meters.serialFrom(list);
    const one = await meters.searchFor(serial);
    if (one.total === 1) {
      await expect(page.getByRole('button', { name: 'Rows per page', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Page 2', exact: true })).toHaveCount(0);
      await expect(page.getByRole('checkbox').nth(1)).toBeVisible();
    }
    await meters.searchFor('NO-SUCH-METER-000');
    await expect(page.getByText('No records match your search or filters.')).toBeVisible();
    await expect(page.getByText(/Showing\s+1[–-]10\s+of\s+0/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Page 2', exact: true })).toHaveCount(0);
  });

  test('MMD-090 spaces are not sent as a search', async ({ page, app }) => {
    await new MeterMasterDataPage(page, app).expectSpacesDoNotSearch();
  });

  test('MMD-003 filters stay pending until Apply, then Reset', async ({ page, app }) => {
    const meters = new MeterMasterDataPage(page, app);
    await meters.expectFilterPanel();
    await meters.expectChoiceDoesNotApply('Filter by connection', 'DTR');
    const dtr = await meters.applyConnection('DTR');
    await meters.expectApplied(1);
    await meters.expectFooter(dtr);
    const online = await meters.applyCommunication('Online');
    await meters.expectApplied(2);
    const params = new URL(online.url).searchParams;
    expect(params.get('connection')).toBe('dtr');
    expect(params.get('communicationStatus')).toBe('communicating');
    const reset = await meters.resetFilters();
    expect(reset.total).toBe(list.total);
  });

  test('MMD-003 a hierarchy id is sent on its own', async ({ page, app }) => {
    const meters = new MeterMasterDataPage(page, app);
    const applied = await meters.applyFirstOrganisation();
    await expect(page.getByRole('switch', { name: /1 Applied/ })).toBeVisible();
    const params = new URL(applied.url).searchParams;
    expect(Number(params.get('organisationLookupId'))).toBeGreaterThan(0);
    expect(params.has('networkLookupId')).toBe(false);
    await meters.expectFooter(applied);
  });

  test('MMD-003 lookups loading disable the panel, and a failed lookup adds no levels', async ({ page, app }) => {
    const meters = new MeterMasterDataPage(page, app);
    await page.route('**/utils/hierarchies/organisation**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.continue();
    });
    await meters.openFilters();
    await page.getByRole('button', { name: 'Hierarchy type', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Organisation', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Apply Filters', exact: true })).toBeDisabled();

    await page.route('**/utils/hierarchies/network**', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false }) }),
    );
    await meters.openFilters();
    await page.getByRole('button', { name: 'Hierarchy type', exact: true }).click();
    const failed = page.waitForResponse(
      (response) => response.url().includes('/utils/hierarchies/network') && response.status() === 500,
    );
    await page.getByRole('menuitem', { name: 'Network', exact: true }).click();
    await failed;
    await expect(page.getByRole('button', { name: 'Apply Filters', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Hierarchy level to search within', exact: true })).toContainText('Select Hierarchy');
  });

  test('MMD-004 and MMD-005 footer, page 2, page size, and the last page', async ({ page, app }) => {
    test.skip(list.total <= 10, 'the list has one page');
    const meters = new MeterMasterDataPage(page, app);
    await meters.expectFooter(list);
    await meters.expectPageSizeMenu();
    const pageTwo = await meters.goToPage(2);
    expect(new URL(pageTwo.url).searchParams.get('page')).toBe('2');
    expect(pageTwo.total).toBe(list.total);
    await meters.expectSerialNumber('11');
    const last = await meters.goToPage(list.totalPages);
    const remainder = list.total % 10;
    expect(last.items.length).toBe(remainder === 0 ? 10 : remainder);
    await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
    const wider = await meters.setPageSize(20);
    expect(new URL(wider.url).searchParams.get('limit')).toBe('20');
    expect(new URL(wider.url).searchParams.get('page') ?? '1').toBe('1');
    expect(wider.items.length).toBeLessThanOrEqual(20);
    const widest = await meters.setPageSize(50);
    expect(new URL(widest.url).searchParams.get('limit')).toBe('50');
  });

  test('MMD-097 page size from page 2 returns to page 1', async ({ page, app }) => {
    test.skip(list.total <= 10, 'the list has one page');
    const meters = new MeterMasterDataPage(page, app);
    await meters.goToPage(2);
    const resized = await meters.setPageSize(20);
    expect(new URL(resized.url).searchParams.get('page') ?? '1').toBe('1');
    expect(resized.limit).toBe(20);
  });

  test('MMD-006 filtered and selected download', async ({ page, app }) => {
    const meters = new MeterMasterDataPage(page, app);
    const serial = meters.serialFrom(list);
    const found = await meters.searchFor(serial);
    const filtered = await meters.downloadFiltered();
    expect(filtered.payload.resource).toBe('meter');
    expect(filtered.payload.mode).toBe('filtered');
    const filters = filtered.payload.filters as Record<string, unknown>;
    expect(filters.q).toBe(serial);
    expect(filters).not.toHaveProperty('page');
    expect(filters).not.toHaveProperty('limit');
    expect(await workbookRows(filtered.bytes)).toBe(found.total);

    await meters.selectRows(1);
    const selected = await meters.downloadSelected(1);
    expect(selected.payload.mode).toBe('selected');
    expect(Array.isArray(selected.payload.selectedIds) && (selected.payload.selectedIds as unknown[]).length).toBeGreaterThan(0);
    expect(await workbookRows(selected.bytes)).toBe(1);
  });

  test('MMD-006 a failed download shows the failure message', async ({ page, app }) => {
    await new MeterMasterDataPage(page, app).expectDownloadFailure('Failed to fetch');
  });

  test('MMD-007 template headers, then every rejected file and row rule', async ({ page, app }) => {
    test.setTimeout(240_000);
    const meters = new MeterMasterDataPage(page, app);
    const dialog = await meters.openBulk();
    const template = await meters.downloadTemplate();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(template);
    const headers: string[] = [];
    workbook.worksheets[0]?.getRow(1).eachCell({ includeEmpty: false }, (cell) => {
      headers.push(String(cell.text ?? cell.value ?? '').trim());
    });
    expect(headers).toEqual([...METER_TEMPLATE_HEADERS]);
    await meters.closeBulk();

    const dir = await mkdtemp(path.join(tmpdir(), 'meter-'));
    const serial = 'ZZ-NOT-A-METER';
    const headersOnly = [...METER_TEMPLATE_HEADERS];
    const cases: Array<{ file: string; rows: string[][]; message: RegExp }> = [
      { file: 'missing.xlsx', rows: [headersOnly.filter((header) => header !== 'Meter Serial Number'), ['x']], message: /Required columns must be present\. Missing:/ },
      { file: 'duplicate-header.xlsx', rows: [[...headersOnly, 'meter serial number'], meterCells({ 'Meter Serial Number': serial })], message: /Duplicate column names are not allowed:/ },
      { file: 'blank-header.xlsx', rows: [headersOnly.map(() => '')], message: /Required columns must be present/ },
      { file: 'no-rows.xlsx', rows: [headersOnly], message: /File must contain at least one data row/ },
      { file: 'blank-serial.xlsx', rows: [headersOnly, meterCells({ 'Meter Manufacturer': 'Acme' })], message: /Meter Serial Number is mandatory/ },
      {
        file: 'duplicate-serial.xlsx',
        rows: [headersOnly, meterCells({ 'Meter Serial Number': serial }), meterCells({ 'Meter Serial Number': serial.toLowerCase() })],
        message: /Duplicate Meter Serial Number/,
      },
      { file: 'rapdrp.xlsx', rows: [headersOnly, meterCells({ 'Meter Serial Number': serial, 'Meter RAPDRP Code': 'OTHER' })], message: /Meter RAPDRP Code must match Meter Serial Number or remain blank/ },
      { file: 'asset.xlsx', rows: [headersOnly, meterCells({ 'Meter Serial Number': serial, 'Asset ID': 'OTHER' })], message: /Asset ID must match Meter Serial Number or remain blank/ },
      { file: 'mptr.xlsx', rows: [headersOnly, meterCells({ 'Meter Serial Number': serial, MPTR: '1.5' })], message: /MPTR must be a valid integer/ },
      { file: 'mf.xlsx', rows: [headersOnly, meterCells({ 'Meter Serial Number': serial, MF: '0' })], message: /MF must be greater than zero/ },
      { file: 'digits.xlsx', rows: [headersOnly, meterCells({ 'Meter Serial Number': serial, 'No. Of Display Digit': '0' })], message: /No\. Of Display Digit must be a valid positive integer/ },
      { file: 'accuracy.xlsx', rows: [headersOnly, meterCells({ 'Meter Serial Number': serial, 'Accuracy Class': '123456789' })], message: /Accuracy Class must not exceed 8 characters/ },
      { file: 'po.xlsx', rows: [headersOnly, meterCells({ 'Meter Serial Number': serial, 'Meter PO Number': 'X'.repeat(33) })], message: /Meter PO Number must not exceed 32 characters/ },
      { file: 'version.xlsx', rows: [headersOnly, meterCells({ 'Meter Serial Number': serial, 'Meter Version': 'Y'.repeat(33) })], message: /Meter Version must not exceed 32 characters/ },
      { file: 'rating.xlsx', rows: [headersOnly, meterCells({ 'Meter Serial Number': serial, 'Meter Rating': 'Z'.repeat(16) })], message: /Meter Rating must not exceed 15 characters/ },
      { file: 'status.xlsx', rows: [headersOnly, meterCells({ 'Meter Serial Number': serial, 'Meter Status': 'maybe' })], message: /Meter Status must be Active or Inactive/ },
      { file: 'sim.xlsx', rows: [headersOnly, meterCells({ 'Meter Serial Number': serial, 'SIM Number': '123' })], message: /SIM Number \(ICCID\) must be numeric with 18 to 20 digits/ },
      { file: 'imsi.xlsx', rows: [headersOnly, meterCells({ 'Meter Serial Number': serial, 'IMSI Number': '123' })], message: /IMSI Number must be numeric with 14 to 15 digits/ },
      { file: 'ip.xlsx', rows: [headersOnly, meterCells({ 'Meter Serial Number': serial, 'IP Address': 'not-an-ip' })], message: /IP Address must be a valid IPv4/ },
      { file: 'modem.xlsx', rows: [headersOnly, meterCells({ 'Meter Serial Number': serial, 'Modem Serial No.': 'short' })], message: /Modem Serial No\. must be 8 to 32 alphanumeric characters/ },
      { file: 'imei.xlsx', rows: [headersOnly, meterCells({ 'Meter Serial Number': serial, 'Modem IMEI No.': '123' })], message: /Modem IMEI No\. must be exactly 15 digits/ },
      { file: 'dlms.xlsx', rows: [headersOnly, meterCells({ 'Meter Serial Number': serial, 'DLMS / Non-DLMS': 'maybe' })], message: /DLMS \/ Non-DLMS must contain valid values/ },
      { file: 'future-po.xlsx', rows: [headersOnly, meterCells({ 'Meter Serial Number': serial, 'Meter PO Date': '2099-01-01' })], message: /Meter PO Date cannot be in the future/ },
      { file: 'future-test.xlsx', rows: [headersOnly, meterCells({ 'Meter Serial Number': serial, 'Meter Testing Date': '2099-01-01' })], message: /Meter Testing Date cannot be in the future/ },
      {
        file: 'test-before-po.xlsx',
        rows: [headersOnly, meterCells({ 'Meter Serial Number': serial, 'Meter PO Date': '2020-02-02', 'Meter Testing Date': '2020-01-01' })],
        message: /Meter Testing Date must be greater than or equal to Meter PO Date/,
      },
    ];
    for (const item of cases) {
      const file = path.join(dir, item.file);
      await writeMeterSheet(file, item.rows);
      await meters.openBulk();
      await meters.chooseBulkFile(file);
      await meters.validateWithoutPost(item.message);
      await meters.closeBulk();
    }

    const text = path.join(dir, 'meters.csv');
    const broken = path.join(dir, 'broken.xlsx');
    await writeFile(text, 'not a workbook');
    await writeFile(broken, 'not a workbook');
    await meters.openBulk();
    await meters.chooseBulkFile(text);
    await meters.validateWithoutPost(/Only \.xlsx files are allowed/);
    await meters.closeBulk();
    await meters.openBulk();
    await meters.chooseBulkFile(broken);
    await meters.validateWithoutPost(/File must be readable and follow the approved template|Only Excel \(\.xlsx\) files are allowed/);
    await meters.closeBulk();

    const oversize = path.join(dir, 'oversize.xlsx');
    await writeFile(oversize, Buffer.alloc(5 * 1024 * 1024 + 1024));
    await meters.openBulk();
    const posted = page
      .waitForRequest((request) => request.method() === 'POST' && request.url().includes('/master-data/bulk-upload-meters'), { timeout: 2_000 })
      .then(() => true)
      .catch(() => false);
    await meters.chooseBulkFile(oversize);
    await expect(page.getByText('File size must be 5 MB or less.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Validate', exact: true })).toBeDisabled();
    expect(await posted, 'an oversized file is not posted').toBe(false);
  });

  test('MMD-008 select, edit, and cancel delete', async ({ page, app }) => {
    test.skip(list.items.length < 2, 'the first page has fewer than two rows');
    const meters = new MeterMasterDataPage(page, app);
    await meters.selectRows(2);
    const editUrl = await meters.editFirst();
    expect(editUrl).toMatch(/\/master-data\/meters\/[^/]+\/edit/);
    await meters.expectEditForm(meters.serialFrom(list));
    await meters.deleteFirstCancelled();
  });

  test('MMD-008 confirming delete stops at the password step', async ({ page, app }) => {
    const meters = new MeterMasterDataPage(page, app);
    const serial = meters.serialFrom(list);
    await meters.confirmDeleteStopsBeforeExecute();
    const stillThere = await meters.searchFor(serial);
    expect(stillThere.total).toBeGreaterThan(0);
  });

  test('Add Meter shows the form and Cancel returns to the list', async ({ page, app }) => {
    const meters = new MeterMasterDataPage(page, app);
    await meters.openAddForm();
    await expect(page.getByRole('textbox', { name: /Meter Serial Number/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page).toHaveURL(/\/master-data\/meters(?:\?|$)/);
  });

  test('a valid meter workbook reaches import preview and is not submitted', async ({ page, app }) => {
    const meters = new MeterMasterDataPage(page, app);
    const serial = meters.serialFrom(list);
    const before = list.total;
    const dir = await mkdtemp(path.join(tmpdir(), 'meter-valid-'));
    const file = path.join(dir, 'valid.xlsx');
    await writeMeterSheet(file, [[...METER_TEMPLATE_HEADERS], meterCells({ 'Meter Serial Number': serial })]);
    const status = await meters.previewValidWorkbook(file);
    expect(status, 'valid workbook validate').toBeLessThan(500);
    const listed = page.waitForResponse(
      (response) => response.url().includes('/meters-data') && response.request().method() === 'GET' && response.ok(),
    );
    await page.goto(app.routes.meterData);
    const body = (await (await listed).json()) as { data?: { pagination?: { total?: number } } };
    expect(body.data?.pagination?.total).toBe(before);
  });

  test('MMD-009 a failed list does not paint a total from the error', async ({ page }) => {
    await page.route('**/meters-data**', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, data: { pagination: { total: 0, rows: [] } } }) }),
    );
    await page.reload();
    await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeDisabled();
    await expect(page.getByRole('checkbox', { name: /Select row / })).toHaveCount(0);
    await expect(page.getByText(/Showing\s+1[–-]10\s+of\s+0/)).toHaveCount(0);
  });

  test('MMD-091 the panel filters are hierarchy, connection, and communication', async ({ page, app }) => {
    await new MeterMasterDataPage(page, app).openFilters();
    await expect(page.getByRole('radio')).toHaveCount(3);
    await expect(page.getByRole('radio', { name: 'All', exact: true })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Online', exact: true })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Offline', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Hierarchy type', exact: true }).click();
    const types = (await page.getByRole('menu').last().getByRole('menuitem').allInnerTexts()).map((label) => label.trim());
    expect(types).toEqual(['Organisation', 'Network']);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Filter by connection', exact: true }).click();
    const connections = (await page.getByRole('menu').last().getByRole('menuitem').allInnerTexts()).map((label) => label.trim());
    expect(connections).toEqual(['All', 'Consumer', 'DTR']);
    await page.keyboard.press('Escape');

    await expect(page.getByRole('button', { name: 'Hierarchy level to search within', exact: true })).toContainText('Select Hierarchy');
    await expect(page.getByRole('button', { name: /mapping/i })).toHaveCount(0);
    await expect(page.getByRole('radio', { name: /never/i })).toHaveCount(0);
  });
});

test('MMD-009 opening Meter Data without a session returns to login', async ({ page, app }) => {
  await page.goto(app.routes.meterData);
  await expect(page).toHaveURL(/\/login/);
});

test('MMD-009 a user without meters.view is denied', async ({ loginPage, data, page, app }) => {
  const rewrite = (route: Route) => denyMeterPermission(route, (key) => key !== 'meters.view');
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
  await page.goto(app.routes.meterData);
  await expect(page.getByText('Access denied', { exact: true })).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Bulk Upload', exact: true })).toHaveCount(0);
});

test('MMD-009 a user without meter create can read but cannot bulk upload', async ({ loginPage, data, page, app }) => {
  const rewrite = (route: Route) => denyMeterPermission(route, (key) => !/meter/i.test(key) || !/create|add|upload|write/i.test(key));
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
  await page.goto(app.routes.meterData);
  await expect(page.getByRole('heading', { name: 'Meter Data' }).or(page.getByText('Meter Data', { exact: true }).first())).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bulk Upload', exact: true })).toHaveCount(0);
});

test('MMD-009 a failed permission request is shown', async ({ loginPage, data, page, app }) => {
  await loginPage.open();
  await loginPage.signIn(data.user('validAdmin'));
  await page.waitForURL(/\/consumers(?:\?|$)/, { timeout: 20_000 });
  await page.route('**/permissions/me/permissions**', (route) => route.abort());
  await page.goto(app.routes.meterData);
  await expect(page.getByText('Unable to load your permissions. Try refreshing the page.')).toBeVisible();
});

async function denyMeterPermission(route: Route, keep: (key: string) => boolean): Promise<void> {
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
  await route.fulfill({
    status: response.status(),
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function workbookRows(bytes: Buffer): Promise<number> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);
  let count = 0;
  workbook.worksheets[0]?.eachRow({ includeEmpty: false }, () => {
    count += 1;
  });
  return Math.max(0, count - 1);
}
