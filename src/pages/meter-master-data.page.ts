import { readFile } from 'node:fs/promises';
import { expect, Locator, Page, Response } from '@playwright/test';
import { BasePage } from './base.page';

export interface MeterList {
  url: string;
  status: number;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  items: Record<string, unknown>[];
}

const LIST_PATH = '/meters-data';

export class MeterMasterDataPage extends BasePage {
  async open(): Promise<MeterList> {
    const pending = this.waitForList((url) => defaultList(new URL(url).searchParams));
    const menu = await this.revealSidebarItem(this.page.getByRole('button', { name: 'Master Data menu', exact: true }));
    await menu.click();
    const meterData = await this.revealSidebarItem(this.page.getByRole('link', { name: 'Meter Data', exact: true }));
    await meterData.click();
    await this.page.waitForURL(/\/master-data\/meters(?:\?|$)/, { timeout: 20_000 });
    const list = await pending;
    await expect(this.heading()).toBeVisible();
    return list;
  }

  async expectShell(list: MeterList): Promise<void> {
    await expect(this.page).toHaveURL(/\/master-data\/meters(?:\?|$)/);
    await expect(this.heading()).toBeVisible();
    await expect(this.main().getByText('Master Data', { exact: true }).first()).toBeVisible();
    await expect(this.main().getByText('Meter Data', { exact: true }).first()).toBeVisible();
    const placeholder = (await this.search().getAttribute('placeholder')) ?? '';
    expect(placeholder, 'search placeholder').toBe('Search by Meter SL No or Modem Serial No');
    expect(list.status, 'meter list').toBe(200);
    const params = new URL(list.url).searchParams;
    expect(defaultList(params), list.url).toBe(true);
    expect(Number.isFinite(list.total), 'list total').toBe(true);
    await expect(this.page.getByRole('columnheader', { name: 'S.No', exact: true })).toBeVisible();
    await expect(this.page.getByRole('button', { name: 'Download', exact: true })).toBeEnabled();
    if (list.total > 0) {
      await this.expectFooter(list);
      await this.expectSerialNumber('1');
    }
  }

  async searchFor(text: string): Promise<MeterList> {
    const pending = this.waitForList((url) => new URL(url).searchParams.get('q') === text.trim());
    await this.search().fill(text);
    const list = await pending;
    await this.expectFooter(list);
    return list;
  }

  async expectSearchMatches(list: MeterList, text: string): Promise<void> {
    const needle = text.trim();
    expect(new URL(list.url).searchParams.get('q'), 'q').toBe(needle);
    const pageNumber = new URL(list.url).searchParams.get('page');
    expect(pageNumber === null || pageNumber === '1', 'search stays on page 1').toBe(true);
    await expect(this.page).not.toHaveURL(/[?&]page=/);
    for (const item of list.items) {
      const haystack = [item.meterSerialNumber, item.modemSerialNumber].map((value) => String(value ?? '')).join(' ');
      expect(haystack, 'row matches search').toContain(needle);
    }
    await this.expectFooter(list);
  }

  async clearSearch(): Promise<MeterList> {
    const pending = this.waitForList((url) => !new URL(url).searchParams.has('q'));
    await this.page.getByRole('button', { name: /^clear search$/i }).click();
    const list = await pending;
    await expect(this.search()).toHaveValue('');
    return list;
  }

  async expectSpacesDoNotSearch(): Promise<void> {
    const leaked = this.page
      .waitForRequest((request) => request.url().includes(LIST_PATH) && new URL(request.url()).searchParams.has('q'), { timeout: 1_500 })
      .then(() => true)
      .catch(() => false);
    await this.search().fill('   ');
    expect(await leaked, 'spaces-only q').toBe(false);
  }

  async expectDebounced(text: string): Promise<MeterList> {
    const pending = this.waitForList((url) => new URL(url).searchParams.get('q') === text.trim());
    let seen = false;
    const onRequest = (request: { url: () => string }) => {
      if (request.url().includes(LIST_PATH) && new URL(request.url()).searchParams.get('q') === text.trim()) {
        seen = true;
      }
    };
    this.page.on('request', onRequest);
    await this.search().fill(text);
    await this.page.waitForTimeout(200);
    this.page.off('request', onRequest);
    expect(seen, 'search waits out the debounce').toBe(false);
    const list = await pending;
    await this.expectFooter(list);
    return list;
  }

  async openFilters(): Promise<void> {
    const toggle = this.page.locator('#meter-master-advanced-filters-toggle');
    const switchToggle = (await toggle.count()) > 0 ? toggle : this.page.getByRole('switch', { name: /Advanced Filters/ });
    if (!(await switchToggle.isChecked())) {
      await switchToggle.check();
    }
    await expect(this.page.getByRole('button', { name: 'Apply Filters', exact: true })).toBeVisible();
    await expect(this.page.getByRole('button', { name: 'Reset Filters', exact: true })).toBeVisible();
  }

  async expectFilterPanel(): Promise<void> {
    await this.openFilters();
    const hierarchy = await this.controlBox('Hierarchy type');
    const level = await this.controlBox('Hierarchy level to search within');
    const connection = await this.controlBox('Filter by connection');
    const online = await this.page.getByRole('radio', { name: 'Online', exact: true }).boundingBox();
    expect(isBefore(hierarchy, level), 'hierarchy before level').toBe(true);
    expect(isBefore(level, connection), 'level before connection').toBe(true);
    expect(isBefore(connection, { x: online?.x ?? 0, y: online?.y ?? 0 }), 'connection before communication').toBe(true);
    await expect(this.page.getByRole('button', { name: 'Hierarchy level to search within', exact: true })).toBeDisabled();
    await expect(this.page.getByRole('radio', { name: 'All', exact: true }).first()).toBeChecked();
  }

  async expectChoiceDoesNotApply(menu: string, label: string): Promise<void> {
    await this.openFilters();
    const leaked = this.page
      .waitForRequest((request) => request.url().includes(LIST_PATH) && request.method() === 'GET', { timeout: 1_200 })
      .then(() => true)
      .catch(() => false);
    await this.chooseMenu(menu, label);
    expect(await leaked, `${label} applies only after Apply Filters`).toBe(false);
  }

  async applyConnection(label: 'Consumer' | 'DTR' | 'All'): Promise<MeterList> {
    await this.openFilters();
    await this.chooseMenu('Filter by connection', label);
    const value = label === 'Consumer' ? 'consumer' : label === 'DTR' ? 'dtr' : '';
    return this.applyList((params) => (value ? params.get('connection') === value : !params.has('connection')), [
      'connection',
      'communicationStatus',
    ]);
  }

  async applyCommunication(label: 'Online' | 'Offline' | 'All'): Promise<MeterList> {
    await this.openFilters();
    await this.page.getByRole('radio', { name: label, exact: true }).check({ force: true });
    const value = label === 'Online' ? 'communicating' : label === 'Offline' ? 'non-communicating' : '';
    return this.applyList(
      (params) => (value ? params.get('communicationStatus') === value : !params.has('communicationStatus')),
      ['connection', 'communicationStatus'],
    );
  }

  async applyFirstOrganisation(): Promise<MeterList> {
    await this.openFilters();
    await this.chooseMenu('Hierarchy type', 'Organisation');
    await expect(this.page.getByRole('button', { name: 'Hierarchy level to search within', exact: true })).toBeEnabled({ timeout: 20_000 });
    const levels = await this.menuLabels('Hierarchy level to search within');
    expect(levels.length, 'organisation levels').toBeGreaterThan(0);
    const lookupWait = this.page.waitForResponse(
      (response) => response.url().includes('/utils/search/organisations') && response.request().method() === 'GET',
      { timeout: 20_000 },
    );
    await this.chooseMenu('Hierarchy level to search within', levels[0]);
    const lookup = await lookupWait;
    const items = lookupItems(await lookup.json());
    expect(items.length, 'organisation entities').toBeGreaterThan(0);
    const selected = await this.pickHierarchyEntity('Search organisation hierarchy', items[0]);
    return this.applyList(
      (params) => params.get('organisationLookupId') === selected.id && !params.has('networkLookupId'),
      ['organisationLookupId'],
    );
  }

  async resetFilters(): Promise<MeterList> {
    await this.openFilters();
    const pending = this.page
      .waitForResponse(
        (response) =>
          response.url().includes(LIST_PATH) &&
          response.request().method() === 'GET' &&
          defaultList(new URL(response.url()).searchParams),
        { timeout: 8_000 },
      )
      .then((response) => readList(response))
      .catch(() => undefined);
    await this.page.getByRole('button', { name: 'Reset Filters', exact: true }).click();
    await expect(this.page.getByText(/\d+\s+Applied/)).toHaveCount(0);
    const list = await Promise.race([
      pending,
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 8_000)),
    ]);
    if (list) {
      return list;
    }
    const footer = await this.footer().innerText();
    const total = Number((footer.match(/of\s+([\d,]+)/) ?? [])[1]?.replace(/,/g, ''));
    return { url: this.page.url(), status: 200, total, page: 1, limit: 10, totalPages: Math.ceil(total / 10), items: [] };
  }

  async expectApplied(count: number): Promise<void> {
    await expect(this.page.getByRole('switch', { name: new RegExp(`Advanced Filters\\s*·\\s*${count} Applied`) })).toBeVisible();
  }

  async expectFooter(list: MeterList): Promise<void> {
    if (list.total === 0) {
      await expect(this.page.getByText(/Showing\s+1[–-]10\s+of\s+0/)).toHaveCount(0);
      return;
    }
    const start = (list.page - 1) * list.limit + 1;
    const end = Math.min(list.page * list.limit, list.total);
    await expect(this.footer()).toContainText(new RegExp(`Showing\\s+${start}[–-]${end}\\s+of\\s+${list.total}\\b`));
  }

  async goToPage(pageNumber: number): Promise<MeterList> {
    const pending = this.waitForList((url) => new URL(url).searchParams.get('page') === String(pageNumber));
    await this.page.getByRole('button', { name: `Page ${pageNumber}`, exact: true }).click();
    const list = await pending;
    await expect(this.page).not.toHaveURL(/[?&]page=/);
    await this.expectFooter(list);
    return list;
  }

  async setPageSize(size: 10 | 20 | 50): Promise<MeterList> {
    const pending = this.waitForList((url) => {
      const params = new URL(url).searchParams;
      const pageNumber = params.get('page');
      return params.get('limit') === String(size) && (pageNumber === null || pageNumber === '1');
    });
    await this.page.getByRole('button', { name: 'Rows per page', exact: true }).click();
    await this.page.getByRole('menuitem', { name: new RegExp(`^${size}\\s*/\\s*page$`, 'i') }).click();
    const list = await pending;
    await expect(this.page.getByRole('button', { name: 'Rows per page', exact: true })).toContainText(new RegExp(`${size}\\s*/\\s*page`, 'i'));
    await expect(this.page).not.toHaveURL(/[?&]page=/);
    return list;
  }

  async expectPageSizeMenu(): Promise<void> {
    await this.page.getByRole('button', { name: 'Rows per page', exact: true }).click();
    const labels = (await this.page.getByRole('menu').last().getByRole('menuitem').allInnerTexts()).map((label) => label.trim());
    expect(labels.map((label) => label.toLowerCase()), 'page size menu').toEqual(['10 / page', '20 / page', '50 / page']);
    await this.page.keyboard.press('Escape');
  }

  async downloadFiltered(): Promise<{ payload: Record<string, unknown>; bytes: Buffer }> {
    return this.clickDownload(/Meter master data downloaded successfully\./);
  }

  async downloadSelected(count: number): Promise<{ payload: Record<string, unknown>; bytes: Buffer }> {
    const noun = count === 1 ? 'meter' : 'meters';
    return this.clickDownload(new RegExp(`Downloaded ${count} selected ${noun}\\.?`));
  }

  async expectDownloadFailure(message: string): Promise<void> {
    await this.page.route('**/master-data/export**', (route) => {
      if (route.request().method() !== 'POST') {
        return route.continue();
      }
      return route.abort();
    });
    await this.downloadButton().click();
    const notice = this.page.getByRole('alert').or(this.page.getByRole('status'));
    await expect(notice.first()).toBeVisible();
    await expect(notice.filter({ hasText: message }).first()).toBeVisible();
  }

  async openBulk(): Promise<Locator> {
    await this.page.getByRole('button', { name: 'Bulk Upload', exact: true }).click();
    const dialog = this.page.getByRole('dialog', { name: 'Bulk Upload Meters' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Upload an Excel (.xlsx) file to add multiple meters at once.')).toBeVisible();
    await expect(dialog.getByText('Need a template?')).toBeVisible();
    await expect(dialog.getByText('Meters_Bulk_Upload_Template.xlsx')).toBeVisible();
    await expect(dialog.getByText('.xlsx · Max 5 MB')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Validate', exact: true })).toBeDisabled();
    return dialog;
  }

  async downloadTemplate(): Promise<string> {
    const download = this.page.waitForEvent('download');
    await this.page.getByRole('dialog', { name: 'Bulk Upload Meters' }).getByRole('button', { name: 'Download Template', exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('Meters_Bulk_Upload_Template.xlsx');
    await expect(this.page.getByText('Meter bulk upload template downloaded.')).toBeVisible();
    const path = await file.path();
    if (!path) {
      throw new Error('Meter template download has no local path');
    }
    return path;
  }

  async chooseBulkFile(filePath: string): Promise<void> {
    const input = this.page.locator('#meter-bulk-file-input');
    await expect(input).toBeEnabled();
    await input.setInputFiles(filePath);
  }

  async validateWithoutPost(message: RegExp): Promise<void> {
    const posted = this.page
      .waitForRequest(
        (request) => request.method() === 'POST' && request.url().includes('/master-data/bulk-upload-meters'),
        { timeout: 2_500 },
      )
      .then(() => true)
      .catch(() => false);
    await this.page.getByRole('dialog', { name: 'Bulk Upload Meters' }).getByRole('button', { name: 'Validate', exact: true }).click();
    expect(await posted, 'rejected file is not posted').toBe(false);
    await expect(this.page.getByText(message).first()).toBeVisible();
  }

  async closeBulk(): Promise<void> {
    const dialog = this.page.getByRole('dialog', { name: 'Bulk Upload Meters' });
    if (!(await dialog.isVisible())) {
      return;
    }
    await this.page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  }

  async selectRows(count: number): Promise<void> {
    const boxes = this.main().getByRole('checkbox');
    for (let index = 1; index <= count; index += 1) {
      await boxes.nth(index).check({ force: true });
    }
  }

  async editFirst(): Promise<string> {
    await this.page.getByRole('button', { name: 'Edit meter', exact: true }).first().click();
    await this.page.waitForURL(/\/master-data\/meters\/[^/]+\/edit(?:\?|$)/, { timeout: 20_000 });
    return this.page.url();
  }

  async deleteFirstCancelled(): Promise<void> {
    await this.page.getByRole('button', { name: 'Delete meter', exact: true }).first().click();
    const dialog = this.page.getByRole('dialog', { name: 'Delete Meter' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Are you sure you want to delete this meter?')).toBeVisible();
    await expect(dialog.getByText('This action will deactivate the selected meter and it will no longer appear in the active Meter List.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(this.page).toHaveURL(/\/master-data\/meters(?:\?|$)/);
  }

  async confirmDeleteStopsBeforeExecute(): Promise<void> {
    await this.page.getByRole('button', { name: 'Delete meter', exact: true }).first().click();
    const confirm = this.page.getByRole('dialog', { name: 'Delete Meter' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
    const stepUp = this.page.getByRole('dialog', { name: /Verify with/ });
    await expect(stepUp).toBeVisible();
    await expect(stepUp.getByText(/Authorize Delete meter/)).toBeVisible();
    await expect(stepUp.getByRole('button', { name: 'Execute', exact: true })).toBeDisabled();
    await this.page.keyboard.press('Escape');
    await expect(stepUp).toBeHidden();
    await expect(this.page).toHaveURL(/\/master-data\/meters(?:\?|$)/);
  }

  async openAddForm(): Promise<void> {
    await this.page.goto(this.route('meterAdd'));
    await expect(this.page.getByText('Add Meter', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    await expect(this.page.getByText('Meter Details', { exact: true })).toBeVisible();
    await expect(this.page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await expect(this.page.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
  }

  async expectEditForm(serial: string): Promise<void> {
    await expect(this.page.getByText('Edit Meter', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    await expect(this.page.getByRole('textbox', { name: /Meter Serial Number/ }).first()).toHaveValue(serial);
    await expect(this.page.getByRole('button', { name: 'Update', exact: true })).toBeDisabled();
    await this.page.getByRole('button', { name: 'Back', exact: true }).click();
    await this.page.waitForURL(/\/master-data\/meters(?:\?|$)/, { timeout: 20_000 });
  }

  async submitNewMeter(filePath: string): Promise<void> {
    await this.openBulk();
    await this.chooseBulkFile(filePath);
    const dialog = this.page.getByRole('dialog', { name: 'Bulk Upload Meters' });
    const validated = this.page.waitForResponse(
      (response) => response.url().includes('/master-data/bulk-upload-meters') && response.request().method() === 'POST',
      { timeout: 60_000 },
    );
    await dialog.getByRole('button', { name: 'Validate', exact: true }).click();
    const validation = await validated;
    expect(validation.ok(), 'meter workbook validation').toBe(true);
    const confirm = dialog.getByRole('checkbox', { name: /I confirm merging matching master-data records/ });
    if (await confirm.isVisible()) {
      await confirm.check();
    }
    const submit = dialog.getByRole('button', { name: 'Submit', exact: true });
    if (!(await submit.isEnabled())) {
      const preview = await dialog.innerText();
      throw new Error(`Meter workbook was not accepted for submit.\n${preview.replace(/\s+/g, ' ').slice(0, 1200)}`);
    }
    await submit.click();
    await expect(this.page.getByText(/uploaded successfully/i)).toBeVisible({ timeout: 30_000 });
    await expect(dialog).toBeHidden({ timeout: 20_000 });
  }

  async previewValidWorkbook(filePath: string): Promise<number> {
    await this.openBulk();
    await this.chooseBulkFile(filePath);
    const pending = this.page.waitForResponse(
      (response) => response.url().includes('/master-data/bulk-upload-meters') && response.request().method() === 'POST',
      { timeout: 60_000 },
    );
    const dialog = this.page.getByRole('dialog', { name: 'Bulk Upload Meters' });
    await dialog.getByRole('button', { name: 'Validate', exact: true }).click();
    const response = await pending;
    const submit = dialog.getByRole('button', { name: 'Submit', exact: true });
    if ((await submit.count()) > 0 && (await submit.isVisible())) {
      await expect(submit).toBeDisabled();
      const confirm = dialog.getByRole('checkbox', { name: /I confirm merging matching master-data records/ });
      await confirm.check();
      await expect(submit).toBeEnabled();
    } else {
      await expect(dialog.getByText(/Preview|validation|row/i).first()).toBeVisible();
    }
    await this.closeBulk();
    return response.status();
  }

  serialFrom(list: MeterList): string {
    const serial = String(list.items.find((item) => String(item.meterSerialNumber ?? '').trim())?.meterSerialNumber ?? '').trim();
    expect(serial, 'meter serial').not.toBe('');
    return serial;
  }

  modemFrom(list: MeterList): string {
    return String(list.items.find((item) => String(item.modemSerialNumber ?? '').trim())?.modemSerialNumber ?? '').trim();
  }

  async expectSerialNumber(value: string): Promise<void> {
    const cell = this.page
      .getByRole('row')
      .nth(1)
      .locator('td.bi-data-table__control-cell')
      .filter({ hasText: new RegExp(`^${value}$`) });
    await expect(cell).toHaveText(value);
  }

  private async clickDownload(success: RegExp): Promise<{ payload: Record<string, unknown>; bytes: Buffer }> {
    const pending = this.page.waitForResponse(
      (response) => response.url().includes('/master-data/export') && response.request().method() === 'POST',
      { timeout: 120_000 },
    );
    const download = this.page.waitForEvent('download', { timeout: 120_000 });
    await this.downloadButton().click();
    const response = await pending;
    expect(response.status(), 'export status').toBe(200);
    const payload = response.request().postDataJSON() as Record<string, unknown>;
    await expect(this.page.getByText(success)).toBeVisible({ timeout: 120_000 });
    await expect(this.downloadButton()).toBeEnabled();
    const file = await download;
    const saved = await file.path();
    const bytes = saved ? await readFile(saved) : await response.body();
    return { payload, bytes };
  }

  private async applyList(match: (params: URLSearchParams) => boolean, allowed: string[]): Promise<MeterList> {
    const pending = this.waitForList();
    await this.page.getByRole('button', { name: 'Apply Filters', exact: true }).click();
    const list = await pending;
    const params = new URL(list.url).searchParams;
    const searchText = (await this.search().inputValue()).trim();
    expect(match(params), list.url).toBe(true);
    expect(keptDefaults(params, searchText ? [...allowed, 'q'] : allowed), list.url).toBe(true);
    expect(list.status, list.url).toBe(200);
    await this.expectFooter(list);
    return list;
  }

  private async controlBox(name: string): Promise<{ x: number; y: number }> {
    const box = await this.page.getByRole('button', { name, exact: true }).boundingBox();
    return { x: box?.x ?? 0, y: box?.y ?? 0 };
  }

  private async menuLabels(name: string): Promise<string[]> {
    const trigger = this.page.getByRole('button', { name, exact: true }).first();
    await trigger.click();
    const menu = this.page.getByRole('menu').last();
    await expect(menu).toBeVisible();
    const labels = (await menu.getByRole('menuitem').allInnerTexts())
      .map((label) => label.replace(/\s+/g, ' ').trim())
      .filter((label) => label && !/^(all|none)$/i.test(label));
    await trigger.click();
    return [...new Set(labels)];
  }

  private async chooseMenu(name: string, label: string): Promise<void> {
    const trigger = this.page.getByRole('button', { name, exact: true }).first();
    await trigger.click();
    const menu = this.page.getByRole('menu').last();
    await expect(menu).toBeVisible();
    const item = menu.getByRole('menuitem', { name: new RegExp(`^\\s*${escapeRegExp(label)}\\s*$`, 'i') });
    await item.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await item.click({ force: true });
    await expect(menu).toBeHidden();
  }

  private async pickHierarchyEntity(searchName: string, item: { id: number; name: string }): Promise<{ id: string }> {
    const search = this.page.getByRole('textbox', { name: searchName, exact: true });
    await expect(search).toBeEnabled();
    await search.click();
    await search.press('ArrowDown');
    const option = this.page.locator(`[id$="-suggestion-${item.id}"]`);
    await expect(option).toBeAttached({ timeout: 15_000 });
    await option.click({ force: true });
    return { id: String(item.id) };
  }

  private async revealSidebarItem(item: Locator): Promise<Locator> {
    await item.waitFor({ state: 'attached' });
    const inView = await item.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.top >= 0 && box.left >= 0 && box.bottom <= window.innerHeight && box.right <= window.innerWidth;
    });
    if (!inView) {
      const opener = this.page.getByRole('button', { name: 'Open navigation menu', exact: true });
      if (await opener.isVisible()) {
        await opener.click();
      }
      await item.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    }
    return item;
  }

  private heading(): Locator {
    return this.main().locator('.theme-text-page-title').getByText('Meter Data', { exact: true });
  }

  private main(): Locator {
    return this.page.getByRole('main');
  }

  private downloadButton(): Locator {
    return this.page.getByRole('button', { name: 'Download', exact: true }).first();
  }

  private search(): Locator {
    return this.page.locator('#meter-master-search');
  }

  private footer(): Locator {
    return this.main().getByText(/Showing\s+.+of\s+\d+/i);
  }

  private waitForList(match: (url: string) => boolean = () => true): Promise<MeterList> {
    return this.page
      .waitForResponse(
        (response) => response.url().includes(LIST_PATH) && response.request().method() === 'GET' && match(response.url()),
        { timeout: 60_000 },
      )
      .then((response) => readList(response));
  }
}

const EXTRA_KEYS = ['q', 'connection', 'communicationStatus', 'organisationLookupId', 'networkLookupId'];

function isBefore(earlier: { x: number; y: number }, later: { x: number; y: number }): boolean {
  if (Math.abs(earlier.y - later.y) <= 4) {
    return earlier.x < later.x;
  }
  return earlier.y < later.y;
}

function defaultList(params: URLSearchParams): boolean {
  const page = params.get('page');
  return (
    (page === null || page === '1') &&
    (params.get('limit') ?? '10') === '10' &&
    params.get('isActive') === 'true' &&
    params.get('mappingStatus') === 'mapped' &&
    EXTRA_KEYS.every((key) => !params.has(key))
  );
}

function keptDefaults(params: URLSearchParams, allowed: string[]): boolean {
  const page = params.get('page');
  if (page && page !== '1') {
    return false;
  }
  if (params.get('isActive') !== 'true' || params.get('mappingStatus') !== 'mapped') {
    return false;
  }
  return EXTRA_KEYS.every((key) => allowed.includes(key) || !params.has(key));
}

function lookupItems(body: unknown): Array<{ id: number; name: string }> {
  const root = isRecord(body) ? body : {};
  const data = isRecord(root.data) ? root.data : root;
  const raw = data.items ?? root.items;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(isRecord).flatMap((item) => {
    const id = Number(item.id);
    const name = String(item.name ?? item.code ?? '').trim();
    return Number.isInteger(id) && id > 0 && name ? [{ id, name }] : [];
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function readList(response: Response): Promise<MeterList> {
  const body = (await response.json()) as { data?: Record<string, unknown> };
  const data = isRecord(body.data) ? body.data : {};
  const rawItems = data.rows ?? data.items;
  const items = Array.isArray(rawItems) ? rawItems.filter(isRecord) : [];
  const pagination = isRecord(data.pagination) ? data.pagination : {};
  const total = typeof pagination.total === 'number' ? pagination.total : Number.NaN;
  const page = typeof pagination.page === 'number' ? pagination.page : 1;
  const limit = typeof pagination.limit === 'number' ? pagination.limit : 10;
  const totalPages = typeof pagination.totalPages === 'number' ? pagination.totalPages : 0;
  return { url: response.url(), status: response.status(), total, page, limit, totalPages, items };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function openMeterData(page: Page, appRoute: string): Promise<void> {
  await page.goto(appRoute);
}
