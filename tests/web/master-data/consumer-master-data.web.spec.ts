import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'path';
import { Route } from '@playwright/test';
import { expect, functionality, test } from '../../../src/core/fixtures/test.fixtures';
import { ConsumerList, ConsumerMasterDataPage } from '../../../src/pages/consumer-master-data.page';
import { LEDGER_TEMPLATE_HEADERS, readFirstRow, writeEmptyLedgerFile, writeLedgerFile } from './ledger-file';

test.describe('Consumer Data @master-data @regression', () => {
  functionality('Master Data');
  test.describe.configure({ timeout: 90_000 });

  let list: ConsumerList;

  test.beforeEach(async ({ loginPage, data, page, app }) => {
    await loginPage.open();
    await loginPage.signIn(data.user('validAdmin'));
    await page.waitForURL(/\/consumers(?:\?|$)/, { timeout: 20_000 });
    list = await new ConsumerMasterDataPage(page, app).open();
  });

  test('CMD-001 Consumer Data opens on the first page @smoke', async ({ page, app }) => {
    await new ConsumerMasterDataPage(page, app).expectShell(list);
  });

  test('CMD-002 search by a meter number from the list, then clear', async ({ page, app }) => {
    const master = new ConsumerMasterDataPage(page, app);
    const identity = master.identityFrom(list);
    const found = await master.searchFor(identity.serialNo);
    await master.expectSearchMatches(found, identity.serialNo);
    const cleared = await master.clearSearch();
    expect(new URL(cleared.url).searchParams.has('q'), 'cleared q').toBe(false);
    expect(cleared.total, 'cleared total').toBe(list.total);
  });

  test('CMD-090 spaces are not sent as a search', async ({ page, app }) => {
    await new ConsumerMasterDataPage(page, app).expectSpacesDoNotSearch();
  });

  test('CMD-005 page 2 and page size 20', async ({ page, app }) => {
    test.skip(list.total <= 10, 'the list has one page');
    const master = new ConsumerMasterDataPage(page, app);
    const pageTwo = await master.goToPage(2);
    expect(new URL(pageTwo.url).searchParams.get('page')).toBe('2');
    const wider = await master.setPageSize(20);
    expect(new URL(wider.url).searchParams.get('limit')).toBe('20');
    expect(wider.items.length).toBeLessThanOrEqual(20);
  });

  test('CMD-006 hide Circle, cancel a hide, keep it after reload, then reset defaults', async ({ page, app }) => {
    await new ConsumerMasterDataPage(page, app).hideCircleColumn();
  });

  test('CMD-007 a row opens that consumer', async ({ page, app }) => {
    const item = list.items.find((row) => String(row.consumerName ?? '').trim());
    expect(item, 'a named consumer').toBeTruthy();
    await new ConsumerMasterDataPage(page, app).openFirstConsumer(item!);
  });

  test('CMD-008 two selected rows can be viewed', async ({ page, app }) => {
    test.skip(list.items.length < 2, 'the first page has fewer than two rows');
    const master = new ConsumerMasterDataPage(page, app);
    await master.selectFirstRows(2);
    const extraList = page
      .waitForResponse((response) => response.url().includes('/master-data/consumer-master-data'), { timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    await page.getByRole('button', { name: 'View Selected', exact: true }).click();
    expect(await extraList, 'view selected does not reload the list').toBe(false);
    await expect(page.getByRole('button', { name: 'Show All', exact: true })).toBeVisible();
  });

  test('CMD-009 Download reports success', async ({ page, app }) => {
    test.setTimeout(240_000);
    await new ConsumerMasterDataPage(page, app).downloadFiltered();
  });

  test('CMD-010 Ledger template and a row that uses a database meter number', async ({ page, app }) => {
    test.setTimeout(120_000);
    const master = new ConsumerMasterDataPage(page, app);
    const identity = master.identityFrom(list);
    const dialog = await master.openLedger();
    const template = await master.downloadLedgerTemplate();
    const read = await readFirstRow(template);
    expect(read.sheet).toBe('Ledger');
    expect(read.headers).toEqual([...LEDGER_TEMPLATE_HEADERS]);

    const dir = await mkdtemp(path.join(tmpdir(), 'ledger-'));
    const valid = path.join(dir, 'valid.xlsx');
    await writeLedgerFile(valid, [
      {
        'Consumer No': identity.consumerNo,
        'Old Consumer No': identity.consumerNo,
        'Serial No': identity.serialNo,
      },
    ]);
    await master.chooseLedgerFile(valid);
    expect((await master.validateChosenLedger()).status, 'valid ledger').toBeLessThan(400);
    await expect(dialog.getByText('Consumer No is required.')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await master.expectTotal(list.total);
  });

  test('CMD-010 Ledger rejects a blank Consumer No', async ({ page, app }) => {
    const master = new ConsumerMasterDataPage(page, app);
    const identity = master.identityFrom(list);
    const dir = await mkdtemp(path.join(tmpdir(), 'ledger-'));
    const blank = path.join(dir, 'blank.xlsx');
    await writeLedgerFile(blank, [{ 'Serial No': identity.serialNo }]);
    await master.openLedger();
    await master.chooseLedgerFile(blank);
    await master.validateChosenLedger();
    await expect(page.getByText('Consumer No is required.')).toBeVisible();
  });

  test('CMD-010 Ledger rejects a Serial No that contains a space', async ({ page, app }) => {
    const master = new ConsumerMasterDataPage(page, app);
    const identity = master.identityFrom(list);
    const spacedSerial = `${identity.serialNo.slice(0, 2)} ${identity.serialNo.slice(2)}`.slice(0, 32);
    const dir = await mkdtemp(path.join(tmpdir(), 'ledger-'));
    const spaced = path.join(dir, 'spaced.xlsx');
    await writeLedgerFile(spaced, [{ 'Consumer No': identity.consumerNo, 'Serial No': spacedSerial }]);
    await master.openLedger();
    await master.chooseLedgerFile(spaced);
    await master.validateChosenLedger();
    const accepted = page.getByText('No errors or field changes in the preview.');
    if (await accepted.isVisible()) {
      console.log(`ISSUE CMD-010: Serial No "${spacedSerial}" was accepted. The spec rejects a serial that contains a space.`);
    }
    await expect(page.getByText('Serial No must not contain spaces.')).toBeVisible();
  });

  test('CMD-010 Ledger rejects an empty workbook and a non-xlsx file', async ({ page, app }) => {
    const master = new ConsumerMasterDataPage(page, app);
    const dir = await mkdtemp(path.join(tmpdir(), 'ledger-'));
    const empty = path.join(dir, 'empty.xlsx');
    const text = path.join(dir, 'notes.txt');
    await writeEmptyLedgerFile(empty);
    await writeFile(text, 'not a workbook');

    await master.openLedger();
    await master.chooseLedgerFile(empty);
    await master.validateChosenLedger();
    await expect(page.getByText(/header row is required|Header row is missing/i)).toBeVisible();
    await page.keyboard.press('Escape');

    await master.openLedger();
    await master.chooseLedgerFile(text);
    const toast = page.getByText('Only .xlsx files are allowed.');
    if (await toast.isVisible()) {
      console.log('ISSUE CMD-010: a non-xlsx file shows "Only .xlsx files are allowed." The spec requires "Unable to read upload file. Use a valid .xlsx spreadsheet."');
    }
    await expect(page.getByText('Unable to read upload file. Use a valid .xlsx spreadsheet.')).toBeVisible();
  });

  test('CMD-013 Bulk Upload opens Ledger, not the consumer-create dialog', async ({ page, app }) => {
    await new ConsumerMasterDataPage(page, app).openLedger();
  });

  test('CMD-092 CMD-093 CMD-094 a bad meter type, net-meter flag, and manufacturer id are ignored', async ({ page, app }) => {
    test.setTimeout(180_000);
    await page.goto(`${app.routes.consumerData}?meterType=bogus&isNetMeter=1&deviceManufacturerTblRefId=0&fromDate=2026-10-01`);
    await expect(page.getByText('Consumer Data', { exact: true }).first()).toBeVisible({ timeout: 60_000 });
    const pending = page.waitForResponse(
      (response) => response.url().includes('/master-data/consumer-master-data') && response.request().method() === 'GET',
      { timeout: 90_000 },
    );
    await page.reload();
    const response = await pending;
    const params = new URL(response.url()).searchParams;
    expect(params.get('meterType')).toBe('all');
    expect(params.has('isNetMeter')).toBe(false);
    expect(params.has('deviceManufacturerTblRefId')).toBe(false);
    expect(params.has('fromDate')).toBe(false);
    expect(params.has('toDate')).toBe(false);
  });

  test('CMD-011 a failed list does not paint a total from the error', async ({ page, data }) => {
    await page.route('**/master-data/consumer-master-data**', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: data.json('payloads/mocks.json', 'consumerListFailed') }),
    );
    const failed = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.request().url().includes('/master-data/consumer-master-data') &&
        response.status() === 500,
      { timeout: 45_000 },
    );
    await page.reload();
    await failed;
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 20_000 });
    const shown = ((await alert.textContent()) ?? '').trim();
    if (shown !== 'Unable to load consumer data.') {
      console.log(`ISSUE CMD-011: a failed list shows "${shown}". The spec requires "Unable to load consumer data."`);
    }
    await expect(alert).toContainText('Unable to load consumer data.');
    await expect(page.getByText(/Showing\s+1[–-]10\s+of\s+0/)).toHaveCount(0);
  });
});

test('CMD-011 opening Consumer Data without a session returns to login', async ({ page, app }) => {
  await page.goto(app.routes.consumerData);
  await expect(page).toHaveURL(/\/login/);
});

test('CMD-011 a user without CONSUMERS_VIEW is denied', async ({ loginPage, data, page, app }) => {
  const rewrite = (route: Route) => denyConsumerView(route);
  await page.route('**/auth/login**', rewrite);
  await page.route('**/auth/me**', rewrite);
  await page.route('**/permissions/me/permissions**', rewrite);
  await loginPage.open();
  await loginPage.signIn(data.user('validAdmin'));
  await page.waitForURL(/\/consumers(?:\?|$)/, { timeout: 20_000 });
  await page.evaluate(() => {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith('rbac.permissionKeys.')) sessionStorage.removeItem(key);
    }
  });
  await page.goto(app.routes.consumerData);
  await expect(page.getByText('Access denied', { exact: true })).toBeVisible();
  const required = 'You need consumers.view to view consumer master data.';
  const named = page.getByText(required);
  if (!(await named.isVisible())) {
    const shown = (await page.getByText(/permission/i).first().textContent())?.trim();
    console.log(
      `ISSUE CMD-011: access denied does not name consumers.view. The page shows "${shown}". The spec requires "${required}".`,
    );
  }
  await expect(named).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go Back', exact: true })).toHaveAttribute('href', '/dashboard');
  await expect(page.getByRole('row')).toHaveCount(0);
});

async function denyConsumerView(route: Route): Promise<void> {
  const response = await route.fetch();
  const body: unknown = await response.json().catch(() => null);
  if (body && typeof body === 'object') {
    const root = (body as { data?: unknown }).data ?? body;
    if (root && typeof root === 'object') {
      const record = root as { isUltimate?: boolean; permissions?: unknown; user?: { roleIsUltimate?: boolean } };
      if (typeof record.isUltimate === 'boolean') record.isUltimate = false;
      if (record.user && typeof record.user.roleIsUltimate === 'boolean') record.user.roleIsUltimate = false;
      if (Array.isArray(record.permissions)) {
        record.permissions = record.permissions.filter((key) => key !== 'consumers.view');
      }
    }
  }
  await route.fulfill({
    status: response.status(),
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}
