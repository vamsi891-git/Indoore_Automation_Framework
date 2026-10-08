import { expect, Locator, Response } from '@playwright/test';
import { BasePage } from './base.page';

export interface DtrList {
  url: string;
  total: number;
  page: number;
  limit: number;
  items: Record<string, unknown>[];
}

const LIST_PATH = '/dtr-master-data';

export class DtrMasterDataPage extends BasePage {
  async open(): Promise<DtrList> {
    const pending = this.waitForList((url) => {
      const params = new URL(url).searchParams;
      return !params.has('q') && !params.has('communicationStatus') && (params.get('page') ?? '1') === '1';
    });
    const menu = await this.reveal(this.page.getByRole('button', { name: 'Master Data menu', exact: true }));
    await menu.click();
    const link = await this.reveal(this.page.getByRole('link', { name: 'DTR Data', exact: true }));
    await link.click();
    await this.page.waitForURL(/\/master-data\/dtrs(?:\?|$)/, { timeout: 20_000 });
    const list = await pending;
    await expect(this.main().locator('.theme-text-page-title').getByText('DTR Data', { exact: true })).toBeVisible();
    return list;
  }

  async searchFor(text: string): Promise<DtrList> {
    const pending = this.waitForList((url) => new URL(url).searchParams.get('q') === text.trim());
    await this.page.locator('#dtr-master-search').fill(text);
    const list = await pending;
    if (list.total > 0) {
      await expect(this.footer()).toContainText(String(list.total));
    }
    return list;
  }

  async applyOnline(): Promise<DtrList> {
    const toggle = this.page.locator('#dtr-master-advanced-filters-toggle');
    if (!(await toggle.isChecked())) {
      await toggle.check();
    }
    await this.page.getByRole('radio', { name: 'Online', exact: true }).check({ force: true });
    const pending = this.waitForList((url) => new URL(url).searchParams.get('communicationStatus') === 'communicating');
    await this.page.getByRole('button', { name: 'Apply Filters', exact: true }).click();
    return pending;
  }

  async goToPage(pageNumber: number): Promise<DtrList> {
    const pending = this.waitForList((url) => new URL(url).searchParams.get('page') === String(pageNumber));
    await this.page.getByRole('button', { name: `Page ${pageNumber}`, exact: true }).click();
    return pending;
  }

  async downloadFiltered(): Promise<Record<string, unknown>> {
    const pending = this.page.waitForResponse(
      (response) => response.url().includes('/master-data/export') && response.request().method() === 'POST',
      { timeout: 120_000 },
    );
    await this.page.getByRole('button', { name: 'Download', exact: true }).first().click();
    const response = await pending;
    expect(response.status(), 'dtr export').toBe(200);
    await expect(this.page.getByText('DTR master data downloaded successfully.')).toBeVisible({ timeout: 120_000 });
    return response.request().postDataJSON() as Record<string, unknown>;
  }

  async rejectCsv(filePath: string): Promise<void> {
    await this.page.getByRole('button', { name: 'Bulk Upload', exact: true }).click();
    const dialog = this.page.getByRole('dialog', { name: 'Bulk Upload DTR' });
    await expect(dialog).toBeVisible();
    await dialog.locator('#dtr-bulk-file-input').setInputFiles(filePath);
    const posted = this.page
      .waitForRequest((request) => request.method() === 'POST' && request.url().includes('/master-data/bulk-upload-dtr'), { timeout: 2_500 })
      .then(() => true)
      .catch(() => false);
    await dialog.getByRole('button', { name: 'Validate', exact: true }).click();
    expect(await posted, 'a csv is not posted').toBe(false);
    await expect(this.page.getByText('Only .xlsx files are allowed.')).toBeVisible();
    await this.page.keyboard.press('Escape');
  }

  async viewFirst(): Promise<string> {
    await this.page.getByRole('button', { name: 'View DTR details', exact: true }).first().click();
    await this.page.waitForURL(/\/dtr\/[^/]+(?:\?|$)/, { timeout: 20_000 });
    return this.page.url();
  }

  async clearSearch(): Promise<DtrList> {
    const pending = this.page
      .waitForResponse(
        (response) =>
          response.url().includes(LIST_PATH) &&
          response.request().method() === 'GET' &&
          !new URL(response.url()).searchParams.has('q'),
        { timeout: 8_000 },
      )
      .then((response) => readList(response))
      .catch(async () => {
        const footer = await this.footer().innerText();
        const total = Number((footer.match(/of\s+([\d,]+)/) ?? [])[1]?.replace(/,/g, ''));
        return { url: this.page.url(), total, page: 1, limit: 10, items: [] };
      });
    await this.page.getByRole('button', { name: /^clear search$/i }).click();
    const list = await pending;
    await expect(this.page.locator('#dtr-master-search')).toHaveValue('');
    return list;
  }

  async expectSpacesDoNotSearch(): Promise<void> {
    const leaked = this.page
      .waitForRequest((request) => request.url().includes(LIST_PATH) && new URL(request.url()).searchParams.has('q'), { timeout: 1_500 })
      .then(() => true)
      .catch(() => false);
    await this.page.locator('#dtr-master-search').fill('   ');
    expect(await leaked, 'spaces are not a search').toBe(false);
  }

  async openFilters(): Promise<void> {
    const toggle = this.page.locator('#dtr-master-advanced-filters-toggle');
    if (!(await toggle.isChecked())) {
      await toggle.check();
    }
    await expect(this.page.getByRole('button', { name: 'Apply Filters', exact: true })).toBeVisible();
  }

  async applyCommunication(label: 'Online' | 'Offline' | 'All'): Promise<DtrList> {
    await this.openFilters();
    await this.page.getByRole('radio', { name: label, exact: true }).check({ force: true });
    const value = label === 'Online' ? 'communicating' : label === 'Offline' ? 'non-communicating' : '';
    const pending = this.waitForList((url) => {
      const params = new URL(url).searchParams;
      return value ? params.get('communicationStatus') === value : !params.has('communicationStatus');
    });
    await this.page.getByRole('button', { name: 'Apply Filters', exact: true }).click();
    const list = await pending;
    await this.expectFooter(list);
    return list;
  }

  async applyFirstOrganisation(): Promise<DtrList> {
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
    const selected = await this.pickHierarchyEntity(items[0]);
    const pending = this.waitForList((url) => new URL(url).searchParams.get('organisationLookupId') === selected.id);
    await this.page.getByRole('button', { name: 'Apply Filters', exact: true }).click();
    return pending;
  }

  async resetFilters(): Promise<DtrList> {
    await this.openFilters();
    const pending = this.page
      .waitForResponse(
        (response) => {
          if (!response.url().includes(LIST_PATH) || response.request().method() !== 'GET') return false;
          const params = new URL(response.url()).searchParams;
          return !params.has('q') && !params.has('communicationStatus') && !params.has('organisationLookupId') && !params.has('networkLookupId');
        },
        { timeout: 8_000 },
      )
      .then((response) => readList(response))
      .catch(async () => {
        const footer = await this.footer().innerText();
        const total = Number((footer.match(/of\s+([\d,]+)/) ?? [])[1]?.replace(/,/g, ''));
        return { url: this.page.url(), total, page: 1, limit: 10, items: [] };
      });
    await this.page.getByRole('button', { name: 'Reset Filters', exact: true }).click();
    return pending;
  }

  async expectFooter(list: DtrList): Promise<void> {
    if (list.total === 0) {
      await expect(this.page.getByText(/Showing\s+1[–-]10\s+of\s+0/)).toHaveCount(0);
      return;
    }
    const start = (list.page - 1) * list.limit + 1;
    const end = Math.min(list.page * list.limit, list.total);
    await expect(this.footer()).toContainText(new RegExp(`Showing\\s+${start}[–-]${end}\\s+of\\s+${list.total}\\b`));
  }

  async expectSerialNumber(value: string): Promise<void> {
    const cell = this.page.getByRole('row').nth(1).locator('td.bi-data-table__control-cell').filter({ hasText: new RegExp(`^${value}$`) });
    await expect(cell).toHaveText(value);
  }

  async setPageSize(size: 20 | 50): Promise<DtrList> {
    const pending = this.waitForList((url) => {
      const params = new URL(url).searchParams;
      return params.get('limit') === String(size) && (params.get('page') ?? '1') === '1';
    });
    await this.page.getByRole('button', { name: 'Rows per page', exact: true }).click();
    await this.page.getByRole('menuitem', { name: new RegExp(`^${size}\\s*/\\s*page$`, 'i') }).click();
    const list = await pending;
    await expect(this.page).not.toHaveURL(/[?&]page=/);
    return list;
  }

  async selectRows(count: number): Promise<void> {
    const boxes = this.main().getByRole('checkbox');
    for (let index = 1; index <= count; index += 1) {
      await boxes.nth(index).check({ force: true });
    }
  }

  async downloadSelected(count: number): Promise<Record<string, unknown>> {
    const pending = this.page.waitForResponse(
      (response) => response.url().includes('/master-data/export') && response.request().method() === 'POST',
      { timeout: 120_000 },
    );
    await this.page.getByRole('button', { name: 'Download', exact: true }).first().click();
    const response = await pending;
    expect(response.status(), 'selected dtr export').toBe(200);
    const noun = count === 1 ? 'DTR' : 'DTRs';
    await expect(this.page.getByText(new RegExp(`Downloaded ${count} selected ${noun}\\.?`))).toBeVisible({ timeout: 120_000 });
    return response.request().postDataJSON() as Record<string, unknown>;
  }

  async expectDownloadFailure(): Promise<void> {
    await this.page.route('**/master-data/export**', (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      return route.abort();
    });
    await this.page.getByRole('button', { name: 'Download', exact: true }).first().click();
    await expect(this.page.getByText('Failed to fetch')).toBeVisible();
  }

  async openBulk(): Promise<Locator> {
    await this.page.getByRole('button', { name: 'Bulk Upload', exact: true }).click();
    const dialog = this.page.getByRole('dialog', { name: 'Bulk Upload DTR' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Validate', exact: true })).toBeDisabled();
    return dialog;
  }

  async downloadTemplate(): Promise<string> {
    const download = this.page.waitForEvent('download');
    await this.page.getByRole('dialog', { name: 'Bulk Upload DTR' }).getByRole('button', { name: 'Download Template', exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('DTRs_Bulk_Upload_Template.xlsx');
    const saved = await file.path();
    if (!saved) throw new Error('DTR template download has no local path');
    return saved;
  }

  async rejectWorkbook(filePath: string, message: RegExp): Promise<void> {
    const dialog = await this.openBulk();
    await dialog.locator('#dtr-bulk-file-input').setInputFiles(filePath);
    const posted = this.page
      .waitForRequest((request) => request.method() === 'POST' && request.url().includes('/master-data/bulk-upload-dtr'), { timeout: 2_500 })
      .then(() => true)
      .catch(() => false);
    await dialog.getByRole('button', { name: 'Validate', exact: true }).click();
    expect(await posted, 'a rejected workbook is not posted').toBe(false);
    await expect(this.page.getByText(message).first()).toBeVisible();
    await this.page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  }

  private main(): Locator {
    return this.page.getByRole('main');
  }

  private footer(): Locator {
    return this.main().getByText(/Showing\s+.+of\s+\d+/i);
  }

  private waitForList(match: (url: string) => boolean): Promise<DtrList> {
    return this.page
      .waitForResponse(
        (response) => response.url().includes(LIST_PATH) && response.request().method() === 'GET' && match(response.url()),
        { timeout: 60_000 },
      )
      .then((response) => readList(response));
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

  private async pickHierarchyEntity(item: { id: number; name: string }): Promise<{ id: string }> {
    const search = this.page.getByRole('textbox', { name: 'Search organisation hierarchy', exact: true });
    await expect(search).toBeEnabled();
    await search.click();
    await search.press('ArrowDown');
    const option = this.page.locator(`[id$="-suggestion-${item.id}"]`);
    await expect(option).toBeAttached({ timeout: 15_000 });
    await option.click({ force: true });
    return { id: String(item.id) };
  }

  private async reveal(item: Locator): Promise<Locator> {
    await item.waitFor({ state: 'attached' });
    const opener = this.page.getByRole('button', { name: 'Open navigation menu', exact: true });
    if (await opener.isVisible()) {
      await opener.click();
    }
    await item.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    return item;
  }
}

async function readList(response: Response): Promise<DtrList> {
  const body = (await response.json()) as { data?: { rows?: unknown[]; pagination?: { total?: number; page?: number; limit?: number } } };
  const rows = body.data?.rows;
  const pagination = body.data?.pagination;
  return {
    url: response.url(),
    total: pagination?.total ?? Number.NaN,
    page: pagination?.page ?? 1,
    limit: pagination?.limit ?? 10,
    items: Array.isArray(rows) ? rows.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object') : [],
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function lookupItems(body: unknown): Array<{ id: number; name: string }> {
  const root = body && typeof body === 'object' ? (body as { data?: { items?: unknown[] }; items?: unknown[] }) : {};
  const raw = root.data?.items ?? root.items;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as { id?: unknown; name?: unknown; code?: unknown };
    const id = Number(record.id);
    const name = String(record.name ?? record.code ?? '').trim();
    return Number.isInteger(id) && id > 0 && name ? [{ id, name }] : [];
  });
}
