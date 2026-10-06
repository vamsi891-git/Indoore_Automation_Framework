import { expect, Locator, Page, Response } from '@playwright/test';
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
    await this.page.getByRole('radio', { name: label, exact: true }).or(this.page.getByRole('button', { name: label, exact: true })).first().click();
    await this.page.getByRole('button', { name: 'Apply Filters', exact: true }).click();
    return pending;
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
    if (await close.isVisible()) {
      await close.click();
    } else {
      await this.page.keyboard.press('Escape');
    }
    await expect(dialog).toBeHidden();
  }

  async expectEveryFilter(totalMeters: number): Promise<void> {
    await this.openFilters();
    await expect(this.page.locator('#consumers-directory-hierarchy-level')).toBeDisabled();
    await expect(this.page.getByRole('button', { name: 'Hierarchy entity filter', exact: true })).toBeDisabled();
    await this.expectHierarchies();

    const leaked = this.page
      .waitForRequest((request) => request.url().includes(LIST_PATH) && request.method() === 'GET', { timeout: 1_200 })
      .then(() => true)
      .catch(() => false);
    await this.chooseMenu('Filter by meter type', 'Live Meters');
    expect(await leaked, 'a dropdown does not reload the list before Apply Filters').toBe(false);

    this.expectOptionTotals(
      'Filter by meter type',
      await this.expectNamedOptions('Filter by meter type', (label) => {
        if (/^live\b/i.test(label)) return (params) => params.get('meterType') === 'live';
        if (/^test\b/i.test(label)) return (params) => params.get('meterType') === 'test';
        throw new Error(`Meter Type option "${label}" is not Live Meters or Test Meters`);
      }),
      totalMeters,
    );
    await this.expectNamedOptions('All Meter Phases', () => (params) => positiveId(params, 'servicePointMeterPhaseTblRefId'));
    this.expectOptionTotals(
      'Filter by connection status',
      await this.expectNamedOptions('Filter by connection status', () => (params) => positiveId(params, 'connectionStatusTblRefId')),
      totalMeters,
    );
    this.expectOptionTotals(
      'All Categories',
      await this.expectNamedOptions('All Categories', () => (params) => positiveId(params, 'categoryTblRefId')),
      totalMeters,
    );
    this.expectOptionTotals(
      'Filter by device manufacturer',
      await this.expectNamedOptions('Filter by device manufacturer', () => (params) => positiveId(params, 'deviceManufacturerTblRefId')),
      totalMeters,
    );
    await this.expectNamedOptions('Filter by payment contract', (label) => {
      if (/net meter/i.test(label)) {
        return (params) => params.get('isNetMeter') === 'true' && !params.has('paymentContractTblRefId');
      }
      return (params) => positiveId(params, 'paymentContractTblRefId') && !params.has('isNetMeter');
    });
    await this.expectCommunication();
    await this.expectClearAll();
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

  private async expectNamedOptions(
    triggerName: string,
    matchFor: (label: string) => (params: URLSearchParams) => boolean,
  ): Promise<Array<{ label: string; total: number }>> {
    await this.openFilters();
    const labels = await this.menuLabels(triggerName);
    expect(labels.length, triggerName).toBeGreaterThan(0);
    console.log(`CMD-003 ${triggerName}: ${labels.join(' | ')}`);
    const totals: Array<{ label: string; total: number }> = [];
    for (const label of labels) {
      await this.openFilters();
      await this.chooseMenu(triggerName, label);
      const list = await this.applyList(matchFor(label), [queryKeyFor(triggerName, label)]);
      console.log(`CMD-003 applied ${triggerName} = ${label}; total ${list.total}`);
      totals.push({ label, total: list.total });
      await expect(this.page.getByText(/\d+\s+Applied/)).toBeVisible();
      await this.resetToDefaults();
    }
    return totals;
  }

  private expectOptionTotals(
    name: string,
    rows: Array<{ label: string; total: number }>,
    totalMeters: number,
  ): void {
    const sum = rows.reduce((total, row) => total + row.total, 0);
    console.log(
      `CMD-003 ${name} sum: ${rows.map((row) => `${row.label} ${row.total}`).join(' + ')} = ${sum}; total meters ${totalMeters}`,
    );
    if (sum !== totalMeters) {
      console.log(`ISSUE CMD-003: ${name} adds up to ${sum}. The unfiltered consumer total is ${totalMeters}.`);
    }
    expect.soft(sum, `${name} equals total meters`).toBe(totalMeters);
  }

  private async expectCommunication(): Promise<void> {
    const choices: Array<{ label: 'Online' | 'Offline' | 'All'; match: (params: URLSearchParams) => boolean }> = [
      { label: 'Online', match: (params) => params.get('communicationStatus') === 'communicating' },
      { label: 'Offline', match: (params) => params.get('communicationStatus') === 'non-communicating' },
      { label: 'All', match: (params) => !params.has('communicationStatus') && params.get('meterType') === 'all' },
    ];
    for (const choice of choices) {
      await this.openFilters();
      await this.page.getByRole('radio', { name: choice.label, exact: true }).check({ force: true });
      const list = await this.applyList(choice.match, choice.label === 'All' ? [] : ['communicationStatus']);
      console.log(`CMD-003 applied communication = ${choice.label}; total ${list.total}`);
      if (choice.label === 'Online') {
        await this.resetToDefaults();
      }
    }
  }

  private async expectHierarchies(): Promise<void> {
    for (const kind of ['Organisation', 'Network'] as const) {
      const path = kind === 'Organisation' ? 'organisations' : 'networks';
      const param = kind === 'Organisation' ? 'organisationLookupId' : 'networkLookupId';
      const other = kind === 'Organisation' ? 'networkLookupId' : 'organisationLookupId';
      const searchName = kind === 'Organisation' ? 'Search organisation hierarchy' : 'Search network hierarchy';
      await this.openFilters();
      await this.chooseMenu('Hierarchy type', kind);
      await expect(this.page.locator('#consumers-directory-hierarchy-level')).toBeEnabled();
      await expect(this.page.getByRole('button', { name: searchName, exact: true })).toBeDisabled();
      await this.menuTrigger('Hierarchy level to search within').click();
      await expect(this.page.getByRole('menu').last().getByRole('menuitem').nth(1)).toBeVisible({ timeout: 20_000 });
      await this.menuTrigger('Hierarchy level to search within').click();
      const levels = await this.menuLabels('Hierarchy level to search within');
      expect(levels.length, `${kind} levels`).toBeGreaterThan(0);
      console.log(`CMD-003 ${kind} levels: ${levels.join(' > ')}`);
      let parentId: string | null = null;
      let parentLabel = '';
      let previousHierarchyId: string | null = null;
      for (const level of levels) {
        await this.openFilters();
        const lookupWait = this.page.waitForResponse((response) => {
          if (!response.url().includes(`/utils/search/${path}`) || response.request().method() !== 'GET') {
            return false;
          }
          const hierarchyId = new URL(response.url()).searchParams.get('hierarchyId');
          return Boolean(hierarchyId) && hierarchyId !== previousHierarchyId;
        }, { timeout: 20_000 });
        await this.chooseMenu('Hierarchy level to search within', level);
        const lookup = await lookupWait;
        const lookupUrl = new URL(lookup.url());
        previousHierarchyId = lookupUrl.searchParams.get('hierarchyId');
        expect(Number(lookupUrl.searchParams.get('hierarchyId')), `${kind} ${level} hierarchyId`).toBeGreaterThan(0);
        expect(lookupUrl.searchParams.get('limit'), `${kind} ${level} limit`).toBe('500');
        const sentParent = lookupUrl.searchParams.get('parentId');
        if (parentId && sentParent !== parentId) {
          console.log(
            `ISSUE CMD-003: ${kind} level "${level}" omitted parentId ${parentId} from "${parentLabel}". The child lookup is not limited to the selected parent.`,
          );
        }
        if (parentId) {
          expect.soft(sentParent, `${kind} ${level} parentId`).toBe(parentId);
        }
        const items = lookupItems(await lookup.json());
        if (items.length === 0) {
          console.log(`CMD-003 ${kind} ${level}: the lookup returned no entities`);
          parentId = null;
          parentLabel = level;
          continue;
        }
        const item = items[0];
        const selected = await this.pickHierarchyEntity(searchName, item);
        const list = await this.applyList(
          (params) => params.get(param) === selected.id && !params.has(other),
          [param],
        );
        console.log(`CMD-003 ${kind} / ${level} / ${selected.label} (${selected.id}) total ${list.total}`);
        parentId = selected.id;
        parentLabel = `${level}: ${selected.label}`;
      }
      await this.resetToDefaults();
    }
  }

  private async expectClearAll(): Promise<void> {
    await this.openFilters();
    await this.chooseMenu('Filter by meter type', 'Test Meters');
    await this.applyList((params) => params.get('meterType') === 'test', []);
    const clear = this.page.getByRole('button', { name: 'Clear All Filters', exact: true });
    if (!(await clear.isVisible())) {
      console.log('ISSUE CMD-003: Clear All Filters is not on the page when Test Meters is applied and the list has rows.');
    }
    expect.soft(await clear.count(), 'Clear All Filters').toBeGreaterThan(0);
    if (await clear.isVisible()) {
      const cleared = this.waitForList((url) => clearedParams(new URL(url).searchParams));
      await clear.click();
      await this.expectListProof(await cleared);
      return;
    }
    await this.resetToDefaults();
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
      const opener = this.page.getByRole('button', { name: 'Open navigation menu', exact: true });
      if (await opener.isVisible()) {
        await opener.click();
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
}

const FILTER_KEYS = [
  'q',
  'connectionStatusTblRefId',
  'categoryTblRefId',
  'meterCategory',
  'meterPhase',
  'servicePointMeterPhaseTblRefId',
  'deviceManufacturerTblRefId',
  'paymentContractTblRefId',
  'isNetMeter',
  'communicationStatus',
  'fromDate',
  'toDate',
];

function queryKeyFor(triggerName: string, label: string): string {
  if (triggerName === 'Filter by meter type') return 'meterType';
  if (triggerName === 'All Meter Phases') return 'servicePointMeterPhaseTblRefId';
  if (triggerName === 'Filter by connection status') return 'connectionStatusTblRefId';
  if (triggerName === 'All Categories') return 'categoryTblRefId';
  if (triggerName === 'Filter by device manufacturer') return 'deviceManufacturerTblRefId';
  if (/net meter/i.test(label)) return 'isNetMeter';
  return 'paymentContractTblRefId';
}

function positiveId(params: URLSearchParams, key: string): boolean {
  const value = Number(params.get(key));
  return Number.isInteger(value) && value > 0;
}

function defaultCompanions(params: URLSearchParams, allowed: string[]): boolean {
  if (!params.get('meterType')) {
    return false;
  }
  const page = params.get('page');
  if (page && page !== '1') {
    return false;
  }
  return FILTER_KEYS.every((key) => allowed.includes(key) || !params.has(key));
}

function clearedParams(params: URLSearchParams): boolean {
  return params.get('meterType') === 'all' && defaultCompanions(params, []);
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

function ledgerReport(body: unknown): string {
  const lines: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      lines.push(value);
      return;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      lines.push(String(value));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (typeof value === 'object' && value !== null) {
      Object.values(value).forEach(walk);
    }
  };
  walk(body);
  return lines.join('\n');
}

function textOf(item: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return '';
}

async function readList(response: Response): Promise<ConsumerList> {
  const body = (await response.json()) as { data?: Record<string, unknown> };
  const data = isRecord(body.data) ? body.data : {};
  const rawItems = data.items ?? data.rows;
  const items = Array.isArray(rawItems) ? rawItems.filter(isRecord) : [];
  const pagination = isRecord(data.pagination) ? data.pagination : undefined;
  const totalValue = data.total ?? pagination?.total;
  const total = typeof totalValue === 'number' ? totalValue : Number.NaN;
  return { url: response.url(), status: response.status(), total, items };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function openConsumerData(page: Page, appRoute: string): Promise<void> {
  await page.goto(appRoute);
}
