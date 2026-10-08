import { expect, Locator, Response } from '@playwright/test';
import { BasePage } from './base.page';

export interface AuditList {
  url: string;
  status: number;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  logs: Record<string, unknown>[];
  columns: { key: string; header: string }[];
  actionFilterOptions: { value: string; label: string }[];
}

const LIST_PATH = '/master-data/audit-logs';

export class ActivityLogsPage extends BasePage {
  async open(): Promise<AuditList> {
    const pending = this.waitForList();
    const link = this.page.getByRole('link', { name: 'Activity Logs', exact: true });
    const menu = this.page.getByRole('button', { name: 'Master Data menu', exact: true });
    if ((await link.count()) === 0) {
      await this.page.goto(this.route('activityLogs'));
    } else {
      if (!(await menu.isVisible().catch(() => false))) {
        const opener = this.page.getByRole('button', { name: 'Open navigation menu', exact: true });
        if (await opener.count()) {
          await opener.evaluate((element: HTMLElement) => element.click());
        }
      }
      if (await menu.count()) {
        await menu.evaluate((element: HTMLElement) => element.click());
      }
      await link.evaluate((element: HTMLElement) => element.click());
    }
    await this.page.waitForURL(/\/master-data\/audit-logs(?:\?|$)/, { timeout: 20_000 });
    const list = await pending;
    await expect(this.title()).toBeVisible();
    return list;
  }

  async expectShell(list: AuditList, todayLabel: string): Promise<void> {
    await expect(this.page).toHaveURL(/\/master-data\/audit-logs$/);
    await expect(this.title()).toHaveText('Activity logs');
    const shown = await this.title().evaluate((element) => getComputedStyle(element).textTransform);
    expect(shown, 'heading displays as Activity Logs').toBe('capitalize');
    await expect(this.main().getByText('Master Data', { exact: true }).first()).toBeVisible();
    await expect(this.main().getByText('Activity Logs', { exact: true }).first()).toBeVisible();
    await expect(this.page.getByRole('button', { name: 'Select activity log date range', exact: true })).toContainText(todayLabel);
    await expect(this.searchBox()).toHaveAttribute('placeholder', 'Search');
    await expect(this.searchBox()).toHaveAttribute('name', 'master-data-audit-search');
    await expect(this.page.getByRole('button', { name: 'Filter master data activity log by actor role', exact: true })).toContainText('All Roles');
    await expect(this.page.getByRole('button', { name: 'Filter master data activity log by action', exact: true })).toContainText('All Actions');
    await expect(this.page.getByRole('table', { name: 'Master data activity logs' })).toBeVisible();
    expect(list.status, 'activity log list').toBe(200);
    const params = new URL(list.url).searchParams;
    expect(params.get('page')).toBe('1');
    expect(params.get('limit')).toBe('20');
    expect(params.has('search')).toBe(false);
    expect(params.has('role')).toBe(false);
    expect(params.has('action')).toBe(false);
    expect(params.has('sort')).toBe(false);
    await expect(this.page.getByRole('button', { name: 'Download', exact: true })).toHaveCount(0);
    await expect(this.page.getByRole('button', { name: 'Bulk Upload', exact: true })).toHaveCount(0);
    await expect(this.page.getByRole('columnheader', { name: 'S.No', exact: true })).toBeVisible();
  }

  async search(text: string): Promise<AuditList> {
    const pending = this.waitForList((url) => url.includes('search='));
    await this.searchBox().click();
    await this.searchBox().fill('');
    await this.searchBox().pressSequentially(text, { delay: 15 });
    const list = await pending;
    expect(new URL(list.url).searchParams.get('search'), 'search is trimmed').toBe(text.trim());
    return list;
  }

  async clearSearch(): Promise<AuditList> {
    const seen: string[] = [];
    const onRequest = (request: { method: () => string; url: () => string }) => {
      if (request.method() === 'GET' && request.url().includes(`${LIST_PATH}?`)) seen.push(request.url());
    };
    this.page.on('request', onRequest);
    const box = this.searchBox();
    await box.click();
    await box.press('Control+A');
    await box.press('Backspace');
    await expect(box).toHaveValue('');
    const listed = await this.waitForList((url) => !new URL(url).searchParams.has('search'), 2_000).catch(() => null);
    await this.page.waitForTimeout(500);
    this.page.off('request', onRequest);
    expect(
      seen.filter((url) => new URL(url).searchParams.has('search')),
      'clearing search must not send the previous search',
    ).toEqual([]);
    return listed ?? emptyList();
  }

  async pickRole(name: string): Promise<AuditList> {
    return this.pick('Filter master data activity log by actor role', name, (url) =>
      name === 'All Roles' ? !new URL(url).searchParams.has('role') : new URL(url).searchParams.get('role') === name,
    );
  }

  async pickAction(label: string, code?: string): Promise<AuditList> {
    return this.pick('Filter master data activity log by action', label, (url) => {
      const action = new URL(url).searchParams.get('action');
      return label === 'All Actions' ? action == null : action === code;
    });
  }

  async openCalendar(): Promise<Locator> {
    const dialog = this.page.getByRole('dialog', { name: 'Date range' });
    if (!(await dialog.isVisible().catch(() => false))) {
      await this.page.getByRole('button', { name: 'Select activity log date range', exact: true }).click();
    }
    await expect(dialog).toBeVisible();
    return dialog;
  }

  async clearRange(): Promise<AuditList> {
    const dialog = await this.openCalendar();
    const pending = this.waitForList((url) => {
      const params = new URL(url).searchParams;
      return !params.has('from') && !params.has('to');
    });
    await dialog.getByRole('button', { name: 'Clear', exact: true }).click();
    return pending;
  }

  async pickRange(startIso: string, endIso: string): Promise<AuditList> {
    const dialog = await this.openCalendar();
    const startColumn = dialog.locator('.bi-date-picker-range-col').nth(0);
    const endColumn = dialog.locator('.bi-date-picker-range-col').nth(1);
    const [fromDay, toDay] = startIso <= endIso ? [startIso, endIso] : [endIso, startIso];
    const pending = this.waitForList((url) => {
      const params = new URL(url).searchParams;
      return params.get('from')?.startsWith(fromDay) === true && params.get('to')?.startsWith(toDay) === true;
    });
    const label = (await this.page.getByRole('button', { name: 'Select activity log date range', exact: true }).innerText()).replace(/\s+/g, ' ');
    if (!label.includes(longDay(startIso))) {
      await startColumn.getByRole('gridcell', { name: startIso, exact: true }).click();
    }
    await endColumn.getByRole('gridcell', { name: endIso, exact: true }).click();
    return pending;
  }

  async pickStartOnly(startIso: string): Promise<AuditList> {
    const dialog = await this.openCalendar();
    const pending = this.waitForList((url) => {
      const params = new URL(url).searchParams;
      return !params.has('from') && !params.has('to');
    });
    await dialog.getByRole('grid').nth(0).getByRole('gridcell', { name: startIso, exact: true }).click();
    return pending;
  }

  async setPageSize(size: 10 | 20 | 50): Promise<AuditList> {
    const pending = this.waitForList((url) => new URL(url).searchParams.get('limit') === String(size) && new URL(url).searchParams.get('page') === '1');
    await this.page.getByRole('button', { name: 'Rows per page', exact: true }).click();
    await this.page.getByRole('menuitem', { name: `${size} / page`, exact: true }).click();
    return pending;
  }

  async nextPage(): Promise<AuditList> {
    const pending = this.waitForList((url) => Number(new URL(url).searchParams.get('page')) > 1);
    await this.page.getByRole('navigation', { name: 'Master data activity log pages' }).getByRole('button', { name: 'Next page' }).click();
    return pending;
  }

  async expectFooter(list: AuditList): Promise<void> {
    if (list.total === 0) {
      await expect(this.page.getByText(/Showing\s+\d+[–-]\d+\s+of\s+/)).toHaveCount(0);
      await expect(this.page.getByText('No data available', { exact: true })).toBeVisible();
      await expect(this.page.getByText('No activity log entries match your filters.', { exact: true })).toBeVisible();
      return;
    }
    const start = (list.page - 1) * list.limit + 1;
    const end = Math.min(list.page * list.limit, list.total);
    await expect(this.page.getByText(new RegExp(`Showing\\s+${start}[–-]${end}\\s+of\\s+${list.total}`))).toBeVisible();
  }

  private async pick(button: string, item: string, matches: (url: string) => boolean): Promise<AuditList> {
    const seen: string[] = [];
    const onResponse = (response: Response) => {
      const url = response.request().url();
      if (response.request().method() === 'GET' && url.includes(LIST_PATH)) seen.push(url);
    };
    this.page.on('response', onResponse);
    try {
      const trigger = this.page.getByRole('button', { name: button, exact: true });
      await trigger.click();
      const restoring = item === 'All Roles' || item === 'All Actions';
      const pending = this.waitForList(matches, restoring ? 3_000 : 20_000);
      await this.page.getByRole('menu').last().getByRole('menuitem', { name: item, exact: true }).click();
      const listed = await pending.catch(() => null);
      if (listed) return listed;
      const param = item === 'All Roles' ? 'role' : item === 'All Actions' ? 'action' : '';
      const resent = param ? seen.filter((url) => new URL(url).searchParams.has(param)) : seen;
      if (restoring && resent.length === 0) {
        await expect(trigger).toContainText(item);
        return emptyList();
      }
      throw new Error(`No activity log response matched ${item}.\nSeen:\n${seen.join('\n') || '(none)'}`);
    } finally {
      this.page.off('response', onResponse);
    }
  }

  private waitForList(matches: (url: string) => boolean = () => true, timeout = 20_000): Promise<AuditList> {
    return this.page
      .waitForResponse(
        (response) => {
          const url = response.request().url();
          return response.request().method() === 'GET' && url.includes(`${LIST_PATH}?`) && matches(url);
        },
        { timeout },
      )
      .then((response) => this.read(response));
  }

  private async read(response: Response): Promise<AuditList> {
    const body = (await response.json()) as {
      data?: {
        total?: number;
        page?: number;
        limit?: number;
        totalPages?: number;
        logs?: Record<string, unknown>[];
        columns?: { key: string; header: string }[];
        actionFilterOptions?: { value: string; label: string }[];
      };
    };
    return {
      url: response.request().url(),
      status: response.status(),
      total: body.data?.total ?? 0,
      page: body.data?.page ?? 1,
      limit: body.data?.limit ?? 20,
      totalPages: body.data?.totalPages ?? 0,
      logs: body.data?.logs ?? [],
      columns: body.data?.columns ?? [],
      actionFilterOptions: body.data?.actionFilterOptions ?? [],
    };
  }

  private searchBox(): Locator {
    return this.page.getByRole('textbox', { name: 'Search master data activity logs', exact: true });
  }

  private title(): Locator {
    return this.main().locator('.theme-text-page-title').getByText('Activity logs', { exact: true });
  }

  private main(): Locator {
    return this.page.getByRole('main');
  }

}

function emptyList(): AuditList {
  return {
    url: `http://localhost${LIST_PATH}?page=1&limit=20`,
    status: 200,
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0,
    logs: [],
    columns: [],
    actionFilterOptions: [],
  };
}

function longDay(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}
