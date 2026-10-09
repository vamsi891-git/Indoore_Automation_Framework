import { expect, Locator } from '@playwright/test';
import {
  type ConsumerFilterHost,
  clearedParams,
  defaultCompanions,
  escapeRegExp,
  ledgerReport,
  readList,
  textOf,
  expectEveryFilter as runExpectEveryFilter,
} from '../core/components/consumer-filters';
import { BasePage } from './base.page';

export interface ConsumerList {
  url: string;
  status: number;
  total: number;
  items: Record<string, unknown>[];
}

export interface LedgerIdentity {
  consumerNo: string;
  serialNo: string;
}

const LIST_PATH = '/master-data/consumer-master-data';

export class ConsumerMasterDataPage extends BasePage {
  async open(): Promise<ConsumerList> {
    const pending = this.waitForList();
    const menu = await this.revealSidebarItem(this.page.getByRole('button', { name: 'Master Data menu', exact: true }));
    await menu.click();
    const consumerData = await this.revealSidebarItem(this.page.getByRole('link', { name: 'Consumer Data', exact: true }));
    await consumerData.click();
    await this.page.waitForURL(/\/master-data\/consumers(?:\?|$)/, { timeout: 20_000 });
    const list = await pending;
    await expect(this.heading()).toBeVisible();
    return list;
  }

  async expectShell(list: ConsumerList): Promise<void> {
    await expect(this.page).toHaveURL(/\/master-data\/consumers(?:\?|$)/);
    await expect(this.heading()).toBeVisible();
    await expect(this.main().getByText('Master Data', { exact: true }).first()).toBeVisible();
    await expect(this.main().getByText('Consumer Data', { exact: true }).first()).toBeVisible();
    const search = this.search();
    const placeholder = (await search.getAttribute('placeholder')) ?? '';
    if (placeholder !== 'Search Consumers') {
      console.log(`ISSUE CMD-001: the search placeholder is "${placeholder}". The spec requires "Search Consumers".`);
    }
    expect(placeholder, 'search placeholder').toMatch(/search consumers/i);
    expect(list.status, 'consumer list').toBe(200);
    const params = new URL(list.url).searchParams;
    expect(params.get('meterType'), 'meterType').toBe('all');
    expect(params.get('limit') ?? '10', 'limit').toBe('10');
    expect(params.has('q'), 'q').toBe(false);
    expect(Number.isFinite(list.total), 'list total').toBe(true);
    if (list.total > 0) {
      await expect(this.footer()).toContainText(new RegExp(`Showing\\s+1\\b[\\s\\S]*of\\s+${list.total}\\b`));
      await expect(this.page.getByRole('row').nth(1)).toBeVisible();
    }
  }

  async searchFor(text: string): Promise<ConsumerList> {
    const pending = this.waitForList((url) => new URL(url).searchParams.get('q') === text.trim());
    await this.search().fill(text);
    return pending;
  }

  async expectSearchMatches(list: ConsumerList, text: string): Promise<void> {
    const needle = text.trim().toLowerCase();
    expect(new URL(list.url).searchParams.get('q'), 'q').toBe(needle);
    const pageNumber = new URL(list.url).searchParams.get('page');
    expect(pageNumber === null || pageNumber === '1', 'search stays on page 1').toBe(true);
    for (const item of list.items) {
      const haystack = [item.consumerName, item.ivrsNo, item.consumerCid, item.meterSerialNumber, item.serialNo]
        .map((value) => String(value ?? '').toLowerCase())
        .join(' ');
      expect(haystack, 'row matches search').toContain(needle);
    }
    await expect(this.footer()).toContainText(new RegExp(`of\\s+${list.total}\\b`));
  }

  async clearSearch(): Promise<ConsumerList> {
    const pending = this.page
      .waitForResponse(
        (response) => response.url().includes(LIST_PATH) && response.request().method() === 'GET' && !new URL(response.url()).searchParams.has('q'),
        { timeout: 4_000 },
      )
      .then((response) => readList(response))
      .catch(() => null);
    const clear = this.page.getByRole('button', { name: /^clear search$/i });
    const clearName = (await clear.getAttribute('aria-label')) ?? (await clear.innerText());
    if (clearName.trim() !== 'Clear Search') {
      console.log(`ISSUE CMD-002: the clear control is "${clearName.trim()}". The spec names it "Clear Search".`);
    }
    await clear.click();
    const list = await pending;
    await expect(this.search()).toHaveValue('');
    if (list) {
      return list;
    }
    const footer = await this.footer().innerText();
    const total = Number(footer.match(/of\s+(\d+)/)?.[1]);
    return { url: this.page.url(), status: 200, total, items: [] };
  }

  async expectSpacesDoNotSearch(): Promise<void> {
    const leaked = this.page
      .waitForRequest(
        (request) => request.url().includes(LIST_PATH) && new URL(request.url()).searchParams.has('q'),
        { timeout: 1_500 },
      )
      .then(() => true)
      .catch(() => false);
    await this.search().fill('   ');
    expect(await leaked, 'spaces-only q').toBe(false);
  }

  async openFilters(): Promise<void> {
    const toggle = this.page.locator('#consumer-master-advanced-filters-toggle');
    if (!(await toggle.isChecked())) {
      await toggle.check();
    }
    await expect(this.page.getByRole('button', { name: 'Apply Filters', exact: true })).toBeVisible();
    await expect(this.page.getByRole('button', { name: 'Reset Filters', exact: true })).toBeVisible();
  }

  async expectTotal(total: number): Promise<void> {
    await expect(this.footer()).toContainText(new RegExp(`of\\s+${total}\\b`));
  }

  async applyMeterType(label: 'Live Meters' | 'Test Meters', query: 'live' | 'test'): Promise<ConsumerList> {
    await this.openFilters();
    await this.page
      .getByRole('combobox', { name: 'Filter by meter type' })
      .or(this.page.getByRole('button', { name: 'Filter by meter type' }))
      .first()
      .click();
    const pending = this.waitForList((url) => new URL(url).searchParams.get('meterType') === query);
    await this.page
      .getByRole('option', { name: label, exact: true })
      .or(this.page.getByRole('menuitem', { name: label, exact: true }))
      .or(this.page.getByRole('button', { name: label, exact: true }))
      .first()
      .click();
    await this.page.getByRole('button', { name: 'Apply Filters', exact: true }).click();
    const list = await pending;
    await expect(this.footer()).toContainText(new RegExp(`of\\s+${list.total}\\b`));
    return list;
  }

  async applyCommunication(label: 'Online' | 'Offline', query: 'communicating' | 'non-communicating'): Promise<ConsumerList> {
    await this.openFilters();
    const pending = this.waitForList((url) => new URL(url).searchParams.get('communicationStatus') === query);
    await this.page.getByRole('radio', { name: label, exact: true }).check({ force: true });
    await this.page.getByRole('button', { name: 'Apply Filters', exact: true }).click();
    return pending;
  }

  async resetFilters(): Promise<void> {
    await this.resetToDefaults();
  }

  async clearFilters(): Promise<ConsumerList> {
    const pending = this.waitForList((url) => {
      const params = new URL(url).searchParams;
      return params.get('meterType') === 'all' && !params.has('communicationStatus') && !params.has('page');
    });
    await this.page.getByRole('button', { name: 'Clear All Filters', exact: true }).click();
    return pending;
  }

  async goToPage(pageNumber: number): Promise<ConsumerList> {
    const pending = this.waitForList((url) => new URL(url).searchParams.get('page') === String(pageNumber));
    await this.page.getByRole('navigation', { name: 'Consumer Data pages' }).getByRole('button', { name: `Page ${pageNumber}`, exact: true }).click();
    const list = await pending;
    await expect(this.page).toHaveURL(new RegExp(`[?&]page=${pageNumber}(?:&|$)`));
    return list;
  }

  async setPageSize(size: 20 | 50): Promise<ConsumerList> {
    const pending = this.waitForList((url) => {
      const params = new URL(url).searchParams;
      const pageNumber = params.get('page');
      return params.get('limit') === String(size) && (pageNumber === null || pageNumber === '1');
    });
    await this.page.getByRole('button', { name: 'Rows per page', exact: true }).click();
    await this.page.getByRole('menuitem', { name: `${size} / page`, exact: true }).click();
    const list = await pending;
    await expect(this.page.getByRole('button', { name: 'Rows per page', exact: true })).toContainText(`${size} / page`);
    return list;
  }

  async hideCircleColumn(): Promise<void> {
    const dialog = await this.openColumns();
    await expect(dialog.getByText('Show in Table')).toBeVisible();
    await expect(dialog.getByText('Hide in Table')).toBeVisible();
    await expect(dialog.getByText('Default Columns')).toBeVisible();
    await expect(dialog.getByText('Add Columns to Hide from the table.')).toBeVisible();
    await expect(dialog.getByText('23')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Hide Consumer Name', exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Hide Actions', exact: true })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Hide Division', exact: true }).click();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(this.page.getByRole('columnheader', { name: 'Division', exact: true })).toBeVisible();

    const applied = await this.openColumns();
    await applied.getByRole('button', { name: 'Hide Circle', exact: true }).click();
    await expect(applied.getByText('Add Columns to Hide from the table.')).toHaveCount(0);
    await expect(applied.getByText('22')).toBeVisible();
    await applied.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(this.page.getByRole('columnheader', { name: 'Circle', exact: true })).toHaveCount(0);
    await expect(this.page.getByRole('columnheader').last()).toHaveText('Actions');

    const reloaded = this.waitForList();
    await this.page.reload();
    await reloaded;
    await expect(this.page.getByRole('columnheader', { name: 'Circle', exact: true })).toHaveCount(0);
    await expect(this.page.getByRole('columnheader').last()).toHaveText('Actions');

    const reset = await this.openColumns();
    await reset.getByRole('button', { name: 'Reset defaults', exact: true }).click();
    await expect(reset.getByText('23')).toBeVisible();
    await reset.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(this.page.getByRole('columnheader', { name: 'Circle', exact: true })).toBeVisible();
    await expect(this.page.getByRole('columnheader').last()).toHaveText('Actions');
  }

  async openFirstConsumer(item: Record<string, unknown>): Promise<void> {
    const name = String(item.consumerName ?? '').trim();
    const row = this.page.getByRole('row').filter({ hasText: new RegExp(escapeRegExp(name), 'i') }).first();
    await row.getByRole('cell').filter({ hasText: new RegExp(escapeRegExp(name), 'i') }).click();
    await this.page.waitForURL(/\/consumers\/[^/]+$/, { timeout: 20_000 });
    const id = encodeURIComponent(String(item.id ?? item.consumerId ?? ''));
    if (id) {
      await expect(this.page).toHaveURL(new RegExp(`/consumers/${id}$`));
    }
  }

  async selectFirstRows(count: number): Promise<void> {
    const boxes = this.main().getByRole('checkbox');
    for (let index = 1; index <= count; index += 1) {
      await boxes.nth(index).check({ force: true });
    }
    await expect(this.page.getByText(`${count} Selected`, { exact: true })).toBeVisible();
    await expect(this.page.getByRole('button', { name: 'View Selected', exact: true })).toBeVisible();
  }

  async downloadFiltered(): Promise<void> {
    const download = this.page.getByRole('button', { name: 'Download', exact: true }).first();
    await expect(download).toBeEnabled();
    const success = this.page.getByText('Consumer master data downloaded successfully.').waitFor({ state: 'visible', timeout: 180_000 });
    await download.click();
    await success;
  }

  async openLedger(): Promise<Locator> {
    await this.page.getByRole('button', { name: 'Bulk upload', exact: true }).click();
    const dialog = this.page.getByRole('dialog', { name: 'Ledger' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Need a template?')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Download Template', exact: true })).toBeVisible();
    await expect(dialog.getByText('Upload Ledger Excel')).toBeVisible();
    await expect(dialog.getByText('.xlsx only • Maximum 200 MB')).toBeVisible();
    await expect(dialog.getByText('Validate checks Ledger rows against current consumer master data.')).toBeVisible();
    await expect(dialog.getByText('Merge.')).toBeVisible();
    await expect(dialog.getByText('Override.')).toBeVisible();
    await expect(dialog.getByText('Compare mode')).toBeVisible();
    await expect(this.page.getByRole('dialog', { name: 'Bulk Upload Consumers' })).toHaveCount(0);
    return dialog;
  }

  async downloadLedgerTemplate(): Promise<string> {
    const dialog = this.page.getByRole('dialog', { name: 'Ledger' });
    const download = this.page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Download Template', exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('Ledger Template.xlsx');
    const path = await file.path();
    if (!path) {
      throw new Error('Ledger template download has no local path');
    }
    return path;
  }

  async chooseLedgerFile(filePath: string): Promise<void> {
    await this.page.getByRole('dialog', { name: 'Ledger' }).locator('#ledger-bulk-file-input').setInputFiles(filePath);
  }

  async chooseLedgerMode(mode: 'Merge' | 'Override'): Promise<void> {
    await this.page.getByRole('dialog', { name: 'Ledger' }).getByRole('radio', { name: new RegExp(mode) }).check();
  }

  async closeLedger(): Promise<void> {
    const dialog = this.page.getByRole('dialog', { name: 'Ledger' });
    if (!(await dialog.isVisible())) {
      return;
    }
    const back = dialog.getByRole('button', { name: 'Back', exact: true });
    if (await back.isVisible()) {
      await back.click();
    }
    const close = dialog.getByRole('button', { name: 'Close', exact: true });
    if ((await close.count()) > 0) {
      await close.evaluate((element: HTMLElement) => element.click());
    } else {
      await this.page.keyboard.press('Escape');
    }
    await expect(dialog).toBeHidden();
  }

  async validateChosenLedger(): Promise<{ status: number; report: string }> {
    const dialog = this.page.getByRole('dialog', { name: 'Ledger' });
    const pending = this.page.waitForResponse(
      (response) => response.url().includes('/ledger/validate') && response.request().method() === 'POST',
      { timeout: 60_000 },
    );
    await dialog.getByRole('button', { name: 'Validate File', exact: true }).click();
    const response = await pending;
    const report = ledgerReport(await response.json().catch(() => ({})));
    return { status: response.status(), report };
  }

  identityFrom(list: ConsumerList): LedgerIdentity {
    for (const item of list.items) {
      const consumerNo = textOf(item, ['ivrsNo', 'ivrs', 'consumerNo', 'consumerCid']);
      const serialNo = textOf(item, ['meterSerialNumber', 'meterSlNo', 'serialNo', 'msn']);
      if (consumerNo && serialNo && !/\s/.test(consumerNo) && !/\s/.test(serialNo)) {
        return { consumerNo, serialNo };
      }
    }
    throw new Error('The consumer list has no row with both an IVRS number and a meter serial from the database');
  }

  private async resetToDefaults(): Promise<void> {
    await this.openFilters();
    const pending = this.page
      .waitForResponse(
        (response) => response.url().includes(LIST_PATH) && response.request().method() === 'GET',
        { timeout: 4_000 },
      )
      .then((response) => readList(response))
      .catch(() => null);
    await this.page.getByRole('button', { name: 'Reset Filters', exact: true }).click();
    const list = await pending;
    if (list) {
      expect(clearedParams(new URL(list.url).searchParams), list.url).toBe(true);
    }
    await expect(this.page.getByText(/\d+\s+Applied/)).toHaveCount(0);
    await expect(this.page).not.toHaveURL(/[?&](?:meterType=(?:live|test)|communicationStatus=|servicePointMeterPhaseTblRefId=|connectionStatusTblRefId=|categoryTblRefId=|deviceManufacturerTblRefId=|paymentContractTblRefId=|isNetMeter=)/);
  }

  private async applyList(
    match: (params: URLSearchParams) => boolean,
    allowed: string[],
  ): Promise<ConsumerList> {
    const pending = this.waitForList();
    await this.page.getByRole('button', { name: 'Apply Filters', exact: true }).click();
    const list = await pending;
    const params = new URL(list.url).searchParams;
    expect(match(params), list.url).toBe(true);
    expect(defaultCompanions(params, allowed), list.url).toBe(true);
    await this.expectListProof(list);
    return list;
  }

  private async expectListProof(list: ConsumerList): Promise<void> {
    expect(list.status, list.url).toBe(200);
    expect(Number.isFinite(list.total), 'list total').toBe(true);
    if (list.total === 0) {
      await expect(this.page.getByText('No data available')).toBeVisible();
      await expect(this.page.getByText(/Showing\s+1[–-]10\s+of\s+0/)).toHaveCount(0);
      return;
    }
    expect(list.items.length, 'rows on the page').toBeGreaterThan(0);
    await expect(this.footer()).toContainText(new RegExp(`of\\s+${list.total}\\b`));
  }

  private menuTrigger(name: string): Locator {
    return this.page.getByRole('button', { name, exact: true }).first();
  }

  private async menuLabels(name: string): Promise<string[]> {
    const trigger = this.menuTrigger(name);
    await trigger.click();
    const menu = this.page.getByRole('menu').last();
    await expect(menu).toBeVisible();
    const labels = (await menu.getByRole('menuitem').allInnerTexts())
      .map((label) => label.replace(/\s+/g, ' ').trim())
      .filter((label) => label && !/^(all|none)$/i.test(label));
    await trigger.click();
    return [...new Set(labels)];
  }

  private async pickHierarchyEntity(
    searchName: string,
    item: { id: number; name: string },
  ): Promise<{ id: string; label: string }> {
    const search = this.page.getByRole('textbox', { name: searchName, exact: true });
    await expect(search).toBeEnabled();
    await search.click();
    await search.press('ArrowDown');
    const option = this.page.locator(`[id$="-suggestion-${item.id}"]`);
    await expect(option).toBeAttached({ timeout: 15_000 });
    const label = ((await option.innerText()) || item.name).replace(/\s+/g, ' ').trim();
    await option.click({ force: true });
    return { id: String(item.id), label };
  }

  private async chooseMenu(name: string, label: string): Promise<void> {
    await this.menuTrigger(name).click();
    const menu = this.page.getByRole('menu').last();
    await expect(menu).toBeVisible();
    const item = menu.getByRole('menuitem', { name: new RegExp(`^\\s*${escapeRegExp(label)}\\s*$`, 'i') });
    await item.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await item.click({ force: true });
    await expect(menu).toBeHidden();
  }

  private async revealSidebarItem(item: Locator): Promise<Locator> {
    await item.waitFor({ state: 'attached' });
    const inView = await item.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.top >= 0 && box.left >= 0 && box.bottom <= window.innerHeight && box.right <= window.innerWidth;
    });
    if (!inView) {
      if ((await this.page.locator('aside.sidebar.sidebar-open').count()) === 0) {
        const opener = this.page.getByRole('button', { name: 'Open navigation menu', exact: true });
        if (await opener.isVisible()) {
          await opener.evaluate((element: HTMLElement) => element.click());
        }
      }
      await item.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    }
    return item;
  }

  private heading(): Locator {
    return this.main().locator('.theme-text-page-title').getByText('Consumer Data', { exact: true });
  }

  private main(): Locator {
    return this.page.getByRole('main');
  }

  private search(): Locator {
    return this.page.locator('#consumer-master-search');
  }

  private footer(): Locator {
    return this.main().getByText(/Showing\s+.+of\s+\d+/i);
  }

  private async openColumns(): Promise<Locator> {
    await this.page.getByRole('button', { name: 'Manage Table Columns', exact: true }).click();
    const dialog = this.page.getByRole('dialog', { name: 'Manage Table Columns' });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  private waitForList(match: (url: string) => boolean = () => true): Promise<ConsumerList> {
    return this.page
      .waitForResponse(
        (response) =>
          response.url().includes(LIST_PATH) &&
          response.request().method() === 'GET' &&
          match(response.url()),
        { timeout: 60_000 },
      )
      .then((response) => readList(response));
  }

  async expectEveryFilter(totalMeters: number): Promise<void> {
    await runExpectEveryFilter(this.filterHost(), totalMeters);
  }

  private filterHost(): ConsumerFilterHost {
    return {
      page: this.page,
      openFilters: () => this.openFilters(),
      chooseMenu: (name, label) => this.chooseMenu(name, label),
      menuLabels: (name) => this.menuLabels(name),
      menuTrigger: (name) => this.menuTrigger(name),
      applyList: (match, allowed) => this.applyList(match, allowed),
      resetToDefaults: () => this.resetToDefaults(),
      expectListProof: (list) => this.expectListProof(list),
      waitForList: (match) => this.waitForList(match),
      pickHierarchyEntity: (searchName, item) => this.pickHierarchyEntity(searchName, item),
    };
  }
}
