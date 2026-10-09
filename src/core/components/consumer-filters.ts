import { expect, Locator, Page, Response } from '@playwright/test';
import type { ConsumerList } from '../../pages/consumer-master-data.page';

const LIST_PATH = '/master-data/consumer-master-data';

export type ConsumerFilterHost = {
  page: Page;
  openFilters(): Promise<void>;
  chooseMenu(name: string, label: string): Promise<void>;
  menuLabels(name: string): Promise<string[]>;
  menuTrigger(name: string): Locator;
  applyList(match: (params: URLSearchParams) => boolean, allowed: string[]): Promise<ConsumerList>;
  resetToDefaults(): Promise<void>;
  expectListProof(list: ConsumerList): Promise<void>;
  waitForList(match?: (url: string) => boolean): Promise<ConsumerList>;
  pickHierarchyEntity(searchName: string, item: { id: number; name: string }): Promise<{ id: string; label: string }>;
};

export async function expectEveryFilter(host: ConsumerFilterHost, totalMeters: number): Promise<void> {
    await host.openFilters();
    await expect(host.page.locator('#consumers-directory-hierarchy-level')).toBeDisabled();
    await expect(host.page.getByRole('button', { name: 'Hierarchy entity filter', exact: true })).toBeDisabled();
    await expectHierarchies(host, );

    const leaked = host.page
      .waitForRequest((request) => request.url().includes(LIST_PATH) && request.method() === 'GET', { timeout: 1_200 })
      .then(() => true)
      .catch(() => false);
    await host.chooseMenu('Filter by meter type', 'Live Meters');
    expect(await leaked, 'a dropdown does not reload the list before Apply Filters').toBe(false);

    expectOptionTotals(host, 
      'Filter by meter type',
      await expectNamedOptions(host, 'Filter by meter type', (label) => {
        if (/^live\b/i.test(label)) return (params) => params.get('meterType') === 'live';
        if (/^test\b/i.test(label)) return (params) => params.get('meterType') === 'test';
        throw new Error(`Meter Type option "${label}" is not Live Meters or Test Meters`);
      }),
      totalMeters,
    );
    await expectNamedOptions(host, 'All Meter Phases', () => (params) => positiveId(params, 'servicePointMeterPhaseTblRefId'));
    expectOptionTotals(host, 
      'Filter by connection status',
      await expectNamedOptions(host, 'Filter by connection status', () => (params) => positiveId(params, 'connectionStatusTblRefId')),
      totalMeters,
    );
    expectOptionTotals(host, 
      'All Categories',
      await expectNamedOptions(host, 'All Categories', () => (params) => positiveId(params, 'categoryTblRefId')),
      totalMeters,
    );
    expectOptionTotals(host, 
      'Filter by device manufacturer',
      await expectNamedOptions(host, 'Filter by device manufacturer', () => (params) => positiveId(params, 'deviceManufacturerTblRefId')),
      totalMeters,
    );
    await expectNamedOptions(host, 'Filter by payment contract', (label) => {
      if (/net meter/i.test(label)) {
        return (params) => params.get('isNetMeter') === 'true' && !params.has('paymentContractTblRefId');
      }
      return (params) => positiveId(params, 'paymentContractTblRefId') && !params.has('isNetMeter');
    });
    await expectCommunication(host, );
    await expectClearAll(host, );
  }

export async function expectNamedOptions(host: ConsumerFilterHost, 
    triggerName: string,
    matchFor: (label: string) => (params: URLSearchParams) => boolean,
  ): Promise<Array<{ label: string; total: number }>> {
    await host.openFilters();
    const labels = await host.menuLabels(triggerName);
    expect(labels.length, triggerName).toBeGreaterThan(0);
    console.log(`CMD-003 ${triggerName}: ${labels.join(' | ')}`);
    const totals: Array<{ label: string; total: number }> = [];
    for (const label of labels) {
      await host.openFilters();
      await host.chooseMenu(triggerName, label);
      const list = await host.applyList(matchFor(label), [queryKeyFor(triggerName, label)]);
      console.log(`CMD-003 applied ${triggerName} = ${label}; total ${list.total}`);
      totals.push({ label, total: list.total });
      await expect(host.page.getByText(/\d+\s+Applied/)).toBeVisible();
      await host.resetToDefaults();
    }
    return totals;
  }

export function expectOptionTotals(
    _host: ConsumerFilterHost, 
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
    expect.soft(sum, `CMD-003 ${name} equals total meters`).toBe(totalMeters);
  }

export async function expectCommunication(host: ConsumerFilterHost, ): Promise<void> {
    const choices: Array<{ label: 'Online' | 'Offline' | 'All'; match: (params: URLSearchParams) => boolean }> = [
      { label: 'Online', match: (params) => params.get('communicationStatus') === 'communicating' },
      { label: 'Offline', match: (params) => params.get('communicationStatus') === 'non-communicating' },
      { label: 'All', match: (params) => !params.has('communicationStatus') && params.get('meterType') === 'all' },
    ];
    for (const choice of choices) {
      await host.openFilters();
      await host.page.getByRole('radio', { name: choice.label, exact: true }).check({ force: true });
      const list = await host.applyList(choice.match, choice.label === 'All' ? [] : ['communicationStatus']);
      console.log(`CMD-003 applied communication = ${choice.label}; total ${list.total}`);
      if (choice.label === 'Online') {
        await host.resetToDefaults();
      }
    }
  }

export async function expectHierarchies(host: ConsumerFilterHost, ): Promise<void> {
    for (const kind of ['Organisation', 'Network'] as const) {
      const path = kind === 'Organisation' ? 'organisations' : 'networks';
      const param = kind === 'Organisation' ? 'organisationLookupId' : 'networkLookupId';
      const other = kind === 'Organisation' ? 'networkLookupId' : 'organisationLookupId';
      const searchName = kind === 'Organisation' ? 'Search organisation hierarchy' : 'Search network hierarchy';
      await host.openFilters();
      await host.chooseMenu('Hierarchy type', kind);
      await expect(host.page.locator('#consumers-directory-hierarchy-level')).toBeEnabled();
      await expect(host.page.getByRole('button', { name: searchName, exact: true })).toBeDisabled();
      await host.menuTrigger('Hierarchy level to search within').click();
      await expect(host.page.getByRole('menu').last().getByRole('menuitem').nth(1)).toBeVisible({ timeout: 20_000 });
      await host.menuTrigger('Hierarchy level to search within').click();
      const levels = await host.menuLabels('Hierarchy level to search within');
      expect(levels.length, `${kind} levels`).toBeGreaterThan(0);
      console.log(`CMD-003 ${kind} levels: ${levels.join(' > ')}`);
      let parentId: string | null = null;
      let parentLabel = '';
      let previousHierarchyId: string | null = null;
      for (const level of levels) {
        await host.openFilters();
        const lookupWait = host.page.waitForResponse((response) => {
          if (!response.url().includes(`/utils/search/${path}`) || response.request().method() !== 'GET') {
            return false;
          }
          const hierarchyId = new URL(response.url()).searchParams.get('hierarchyId');
          return Boolean(hierarchyId) && hierarchyId !== previousHierarchyId;
        }, { timeout: 20_000 });
        await host.chooseMenu('Hierarchy level to search within', level);
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
          expect.soft(sentParent, `CMD-003 ${kind} ${level} parentId`).toBe(parentId);
        }
        const items = lookupItems(await lookup.json());
        if (items.length === 0) {
          console.log(`CMD-003 ${kind} ${level}: the lookup returned no entities`);
          parentId = null;
          parentLabel = level;
          continue;
        }
        const item = items[0];
        const selected = await host.pickHierarchyEntity(searchName, item);
        const list = await host.applyList(
          (params) => params.get(param) === selected.id && !params.has(other),
          [param],
        );
        console.log(`CMD-003 ${kind} / ${level} / ${selected.label} (${selected.id}) total ${list.total}`);
        parentId = selected.id;
        parentLabel = `${level}: ${selected.label}`;
      }
      await host.resetToDefaults();
    }
  }

export async function expectClearAll(host: ConsumerFilterHost, ): Promise<void> {
    await host.openFilters();
    await host.chooseMenu('Filter by meter type', 'Test Meters');
    await host.applyList((params) => params.get('meterType') === 'test', []);
    const clear = host.page.getByRole('button', { name: 'Clear All Filters', exact: true });
    if (!(await clear.isVisible())) {
      console.log('ISSUE CMD-003: Clear All Filters is not on the page when Test Meters is applied and the list has rows.');
    }
    expect.soft(await clear.count(), 'CMD-003 Clear All Filters').toBeGreaterThan(0);
    if (await clear.isVisible()) {
      const cleared = host.waitForList((url) => clearedParams(new URL(url).searchParams));
      await clear.click();
      await host.expectListProof(await cleared);
      return;
    }
    await host.resetToDefaults();
  }


export function queryKeyFor(triggerName: string, label: string): string {
  if (triggerName === 'Filter by meter type') return 'meterType';
  if (triggerName === 'All Meter Phases') return 'servicePointMeterPhaseTblRefId';
  if (triggerName === 'Filter by connection status') return 'connectionStatusTblRefId';
  if (triggerName === 'All Categories') return 'categoryTblRefId';
  if (triggerName === 'Filter by device manufacturer') return 'deviceManufacturerTblRefId';
  if (/net meter/i.test(label)) return 'isNetMeter';
  return 'paymentContractTblRefId';
}

export function positiveId(params: URLSearchParams, key: string): boolean {
  const value = Number(params.get(key));
  return Number.isInteger(value) && value > 0;
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

export function defaultCompanions(params: URLSearchParams, allowed: string[]): boolean {
  if (!params.get('meterType')) {
    return false;
  }
  const page = params.get('page');
  if (page && page !== '1') {
    return false;
  }
  return FILTER_KEYS.every((key) => allowed.includes(key) || !params.has(key));
}

export function clearedParams(params: URLSearchParams): boolean {
  return params.get('meterType') === 'all' && defaultCompanions(params, []);
}

export function lookupItems(body: unknown): Array<{ id: number; name: string }> {
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

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function ledgerReport(body: unknown): string {
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

export function textOf(item: Record<string, unknown>, keys: string[]): string {
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

export async function readList(response: Response): Promise<ConsumerList> {
  const body = (await response.json()) as { data?: Record<string, unknown> };
  const data = isRecord(body.data) ? body.data : {};
  const rawItems = data.items ?? data.rows;
  const items = Array.isArray(rawItems) ? rawItems.filter(isRecord) : [];
  const pagination = isRecord(data.pagination) ? data.pagination : undefined;
  const totalValue = data.total ?? pagination?.total;
  const total = typeof totalValue === 'number' ? totalValue : Number.NaN;
  return { url: response.url(), status: response.status(), total, items };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function openConsumerData(page: Page, appRoute: string): Promise<void> {
  await page.goto(appRoute);
}
