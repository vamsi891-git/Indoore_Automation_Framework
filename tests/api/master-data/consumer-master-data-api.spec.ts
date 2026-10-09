import { readFileSync } from 'fs';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { expect, functionality, test } from '../../../src/core/fixtures/test.fixtures';
import type { ExportPayload } from '../../../src/core/data/dataset.types';
import { ApiClient, type ApiResult } from '../../../src/core/api/api.client';
import {
  loginSchema,
  exportJobSchema,
  hierarchyListSchema,
  ledgerValidateSchema,
  lookupListSchema,
  masterListSchema,
  meterCommunicationSchema,
  permissionKeysSchema,
  permissionModulesSchema,
  scopeAnchorSchema,
  sessionMeSchema,
  validationErrorSchema,
} from '../../../src/core/api/dashboard.schemas';
import { writeLedgerFile } from '../../web/master-data/ledger-file';
import { expectApiContract, expectAuthorizedContract, expectUnauthorized, totalCount } from '../support/expect-dashboard-contract';

const listTimeout = 60_000;
let responseLimitMs = 30_000;

test.describe('Consumer master data API @master-data @regression', () => {
  functionality('Master Data');
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ api, data, env }) => {
    responseLimitMs = env.timeouts.api;
    const login = await api.authenticate(data.user('validAdmin'));
    expectApiContract(login, loginSchema, responseLimitMs, 'login', { authorized: false, hasBody: true });
  });

  test('the first page returns rows for meterType=all @smoke', async ({ api }) => {
    const result = await list(api, { meterType: 'all', limit: 10, page: 1, includeArchiveCounts: false });
    const body = expectAuthorizedContract(result, masterListSchema, responseLimitMs, 'consumer list');
    const total = totalCount(body.data, 'consumer list');
    const rows = rowsOf(body.data);
    expect(total, 'consumer list').toBeGreaterThan(0);
    expect(rows.length, 'first page').toBe(Math.min(10, total));
    expect(serialOf(rows[0]), 'meter serial on the first row').not.toBe('');
  });

  test('search by a meter serial from the list', async ({ api }) => {
    const first = await readList(api, { meterType: 'all', limit: 10, page: 1, includeArchiveCounts: false });
    const serial = serialOf(first.rows[0]);
    const found = await readList(api, { meterType: 'all', limit: 10, page: 1, q: serial, includeArchiveCounts: false });
    expect(found.total, `search ${serial}`).toBeGreaterThan(0);
    expect(
      found.rows.some((row) => serialOf(row) === serial || serialOf(row).startsWith(serial)),
      `a row matches ${serial}`,
    ).toBe(true);
  });

  test('page 2 with limit 20 does not repeat page 1', async ({ api }) => {
    const page1 = await readList(api, { meterType: 'all', limit: 20, page: 1, includeArchiveCounts: false });
    expect(page1.total, 'consumer list').toBeGreaterThan(20);
    expect(page1.rows.length, 'page 1').toBe(20);
    const page2 = await readList(api, { meterType: 'all', limit: 20, page: 2, includeArchiveCounts: false });
    expect(page2.total, 'page 2 total').toBe(page1.total);
    expect(page2.rows.length, 'page 2').toBe(20);
    expect(rowId(page2.rows[0]), 'page 2 first row').not.toBe(rowId(page1.rows[0]));
  });

  test('live plus test, categories, manufacturers, and connection status each equal the total', async ({ api }) => {
    test.setTimeout(600_000);
    const total = await listTotal(api, { meterType: 'all' });
    expect(total, 'consumer list').toBeGreaterThan(0);

    expectPartition('meter type', [
      await namedTotal(api, 'Live', { meterType: 'live' }),
      await namedTotal(api, 'Test', { meterType: 'test' }),
    ], total);

    expectPartition(
      'connection status',
      await namedTotals(api, await lookupItems(api, 'utilsConnectionStatuses'), 'connectionStatusTblRefId'),
      total,
    );
    expectPartition(
      'categories',
      await namedTotals(api, await lookupItems(api, 'utilsConsumerCategories'), 'categoryTblRefId'),
      total,
    );
    expectPartition(
      'device manufacturer',
      await namedTotals(api, await lookupItems(api, 'utilsDeviceManufacturers'), 'deviceManufacturerTblRefId'),
      total,
    );
  });

  test('a child hierarchy lookup is limited to the selected parent', async ({ api }) => {
    await expectChildLookupLimited(api, 'organisation', 'utilsSearchOrganisations');
    await expectChildLookupLimited(api, 'network', 'utilsSearchNetworks');
  });

  test('meter phases, payment contracts, and communication each equal the total', async ({ api }) => {
    test.setTimeout(180_000);
    const total = await listTotal(api, { meterType: 'all' });
    expectPartition(
      'meter phase',
      await namedTotals(api, await lookupItems(api, 'utilsMeterPhases'), 'servicePointMeterPhaseTblRefId'),
      total,
    );
    expectPartition(
      'payment contract',
      await namedTotals(api, await lookupItems(api, 'utilsPaymentContracts'), 'paymentContractTblRefId'),
      total,
    );
    const netMeter = await listTotal(api, { isNetMeter: true });
    console.log(`CMD-003 API net meter: ${netMeter}; total meters ${total}`);
    expect(netMeter, 'net meter is inside the fleet').toBeLessThanOrEqual(total);
    expectPartition('communication', [
      await namedTotal(api, 'Online', { communicationStatus: 'communicating' }),
      await namedTotal(api, 'Offline', { communicationStatus: 'non-communicating' }),
    ], total);
    const never = await listTotal(api, { communicationStatus: 'never-communicated' });
    console.log(`CMD-003 API never communicated: ${never}; total meters ${total}`);
    expect(never, 'never communicated is inside the fleet').toBeLessThanOrEqual(total);
  });

  test('meter communication counts add up and cover the visible serials', async ({ api }) => {
    const result = await api.get('meterCommunicationStatus', {
      query: { limit: 20, page: 1 },
      expectedStatus: 200,
      timeout: listTimeout,
    });
    const body = expectAuthorizedContract(result, meterCommunicationSchema, responseLimitMs, 'meter communication');
    expect(body.data.communicatingCount + body.data.nonCommunicatingCount, 'communicating plus non-communicating').toBe(body.data.activeMeters);
    expect(body.data.pagination.total, 'communication total').toBe(body.data.activeMeters);

    const page = await readList(api, { meterType: 'all', limit: 10, page: 1, includeArchiveCounts: false });
    const serials = page.rows.map(serialOf).filter((serial) => serial.length > 0);
    expect(serials.length, 'serials on the first page').toBeGreaterThan(0);
    const matched = await api.get('meterCommunicationStatus', {
      query: { meterSerialNumbers: serials.join(','), limit: serials.length },
      expectedStatus: 200,
      timeout: listTimeout,
    });
    const dots = expectAuthorizedContract(matched, meterCommunicationSchema, responseLimitMs, 'page serial communication');
    const returned = new Set(
      dots.data.rows.map((row) => row.meterSerialNumber).filter((serial): serial is string => typeof serial === 'string' && serial.length > 0),
    );
    for (const serial of serials) {
      expect(returned.has(serial), `communication status for ${serial}`).toBe(true);
    }
  });

  test('a hierarchy node contains the consumers of its children', async ({ api }) => {
    test.setTimeout(180_000);
    await expectChildConsumersWithinParent(api, 'organisation', 'utilsSearchOrganisations', 'organisationLookupId');
    await expectChildConsumersWithinParent(api, 'network', 'utilsSearchNetworks', 'networkLookupId');
  });

  test('scope anchor, time of day, blank search, and a one-sided date follow the contract', async ({ api }) => {
    for (const kind of ['organisation', 'network'] as const) {
      const result = await api.get('utilsScopeAnchor', { params: { kind }, expectedStatus: 200 });
      const body = expectAuthorizedContract(result, scopeAnchorSchema, responseLimitMs, `${kind} scope anchor`);
      if (body.data.anchor) {
        const queryKey = kind === 'organisation' ? 'organisationLookupId' : 'networkLookupId';
        const scoped = await listTotal(api, { [queryKey]: body.data.anchor.lookupId });
        const fleet = await listTotal(api, { meterType: 'all' });
        expect(scoped, `${kind} scope`).toBeLessThanOrEqual(fleet);
      }
    }
    const times = await lookupItems(api, 'utilsTimeOfDays');
    expect(new Set(times.map((item) => item.id)).size, 'time of day ids').toBe(times.length);

    const fleet = await listTotal(api, { meterType: 'all' });
    const blank = await listTotal(api, { q: '   ' });
    expect(blank, 'spaces are not a search').toBe(fleet);
    const dated = await listTotal(api, { fromDate: '2026-01-01', toDate: '2026-01-02' });
    expect(dated, 'a date pair stays inside the fleet').toBeLessThanOrEqual(fleet);
    await expectValidation(api, { fromDate: '2026-01-01' });
    await expectValidation(api, { limit: 0 });
    await expectValidation(api, { limit: 101 });
    await expectValidation(api, { page: 0 });
  });

  test('session, permissions, ledger, and export follow the page contract', async ({ api, data }) => {
    test.setTimeout(180_000);
    const me = await api.get('authMe', { expectedStatus: 200 });
    const session = expectAuthorizedContract(me, sessionMeSchema, responseLimitMs, 'auth me');
    expect(session.data.user.email, 'signed-in email').toContain('@');

    const keys = await api.get('myPermissions', { expectedStatus: 200 });
    const permissions = expectAuthorizedContract(keys, permissionKeysSchema, responseLimitMs, 'permission keys');
    expect(permissions.data.permissions, 'consumers.view').toContain('consumers.view');

    const modulesResult = await api.get('myPermissionModules', { expectedStatus: 200 });
    const modules = expectAuthorizedContract(modulesResult, permissionModulesSchema, responseLimitMs, 'permission modules');
    expect(modules.data.modules.some((item) => item.key === 'consumers'), 'consumers module').toBe(true);

    const template = await api.get('ledgerTemplate', { expectedStatus: 200, timeout: listTimeout });
    expectSpreadsheet(template, 'ledger template');

    const sample = await readList(api, { meterType: 'test', limit: 1, page: 1, includeArchiveCounts: false });
    const serial = serialOf(sample.rows[0]);
    expect(serial, 'a database meter serial').not.toBe('');
    const blankPath = join(await mkdtemp(join(tmpdir(), 'ledger-api-')), 'ledger-blank-consumer.xlsx');
    await writeLedgerFile(blankPath, [{ 'Serial No': serial }]);
    const validated = await api.post('ledgerValidate', {
      multipart: {
        mode: 'MERGE',
        file: {
          name: 'ledger-blank-consumer.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer: readFileSync(blankPath),
        },
      },
      expectedStatus: 200,
      timeout: listTimeout,
    });
    const ledger = expectAuthorizedContract(validated, ledgerValidateSchema, responseLimitMs, 'ledger validate');
    const summary = ledger.summary;
    expect(summary.new + summary.updated + summary.unchanged + summary.invalid, 'ledger summary parts').toBe(summary.total);
    if (summary.invalid < 1) {
      console.log('ISSUE CMD-010 API: a blank Consumer No validated with Invalid 0. The spec rejects a blank Consumer No.');
    }
    expect.soft(summary.invalid, 'blank Consumer No is invalid').toBeGreaterThan(0);

    const notes = await api.post('ledgerValidate', {
      multipart: {
        mode: 'MERGE',
        file: {
          name: 'notes.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('not a workbook'),
        },
      },
      expectedStatus: 400,
      timeout: listTimeout,
    });
    expectApiContract(notes, validationErrorSchema, responseLimitMs, 'non-xlsx ledger file', { status: 400 });

    const exported = await api.post('consumerMasterExport', {
      data: data.payload<ExportPayload>('payloads/exports.json', 'consumerFiltered'),
      failOnStatus: false,
      timeout: listTimeout,
    });
    expect(exported.durationMs, `export response time ${exported.durationMs}ms`).toBeLessThanOrEqual(responseLimitMs);
    expect(exported.requestHeaders.Authorization, 'export Authorization').toMatch(/^Bearer\s+\S+/);
    if (exported.status === 202) {
      const job = exportJobSchema.parse(exported.body);
      expect(job.data.rowEstimate, 'queued export').toBeGreaterThanOrEqual(0);
      return;
    }
    expect(exported.status, 'export status').toBe(200);
    expectSpreadsheet(exported, 'consumer export');
  });

  test('rejects a bogus meter type, isNetMeter=1, and manufacturer id 0', async ({ api }) => {
    await expectValidation(api, { meterType: 'bogus' });
    await expectValidation(api, { isNetMeter: 1 });
    await expectValidation(api, { deviceManufacturerTblRefId: 0 });
  });
});

test.describe('Consumer master data API security @master-data @regression', () => {
  functionality('Master Data');

  test('every consumer master data read rejects a missing token and a bad bearer', async ({ request, app, env }) => {
    const anonymous = new ApiClient(request, app, env);
    const reads = [
      'consumerMasterData',
      'utilsMeterPhases',
      'utilsConnectionStatuses',
      'utilsConsumerCategories',
      'utilsDeviceManufacturers',
      'utilsPaymentContracts',
      'utilsTimeOfDays',
      'meterCommunicationStatus',
      'authMe',
      'myPermissions',
      'myPermissionModules',
      'ledgerTemplate',
      'utilsSearchOrganisations',
      'utilsSearchNetworks',
    ];
    for (const endpoint of reads) {
      const missing = await anonymous.get(endpoint, { expectedStatus: 401 });
      expectUnauthorized(missing, env.timeouts.api, `${endpoint} missing token`);
      const forged = await anonymous.get(endpoint, {
        headers: { Authorization: 'Bearer not-a-token' },
        expectedStatus: 401,
      });
      expectUnauthorized(forged, env.timeouts.api, `${endpoint} bad bearer`, { sentToken: true });
    }
  });
});

function expectSpreadsheet(result: ApiResult<unknown>, label: string): void {
  expect(result.status, `${label} status`).toBe(200);
  expect(result.durationMs, `${label} response time ${result.durationMs}ms`).toBeLessThanOrEqual(responseLimitMs);
  expect(result.contentType, `${label} content type`).toMatch(/spreadsheetml|octet-stream|application\/zip/i);
  expect(result.requestHeaders.Authorization, `${label} Authorization`).toMatch(/^Bearer\s+\S+/);
  expect(String(result.body).startsWith('PK'), `${label} xlsx`).toBe(true);
}

function expectPartition(name: string, rows: Array<{ label: string; total: number }>, totalMeters: number): void {
  const sum = rows.reduce((total, row) => total + row.total, 0);
  console.log(`CMD-003 API ${name}: ${rows.map((row) => `${row.label} ${row.total}`).join(' + ')} = ${sum}; total meters ${totalMeters}`);
  if (sum !== totalMeters) {
    console.log(`ISSUE CMD-003 API: ${name} adds up to ${sum}. The unfiltered consumer total is ${totalMeters}.`);
  }
  expect.soft(sum, `${name} equals total meters`).toBe(totalMeters);
}

async function expectChildLookupLimited(api: ApiClient, kind: 'organisation' | 'network', endpoint: string): Promise<void> {
  const levels = await hierarchyLevels(api, kind);
  expect(levels.length, `${kind} levels`).toBeGreaterThan(1);
  for (let index = 0; index < levels.length - 1; index += 1) {
    const parents = await lookupItems(api, endpoint, { hierarchyId: levels[index].id, limit: 20 });
    if (parents.length < 2) {
      continue;
    }
    const childSets: string[][] = [];
    for (const parent of parents) {
      const children = await lookupItems(api, endpoint, {
        hierarchyId: levels[index + 1].id,
        parentId: parent.id,
        limit: 50,
      });
      if (children.length > 0) {
        childSets.push(children.map((item) => String(item.id)));
      }
      if (childSets.length === 2) {
        break;
      }
    }
    expect(childSets.length, `${kind} ${levels[index].name} parents with ${levels[index + 1].name} children`).toBe(2);
    const overlap = childSets[0].filter((id) => childSets[1].includes(id));
    if (overlap.length > 0) {
      console.log(
        `ISSUE CMD-003 API: ${kind} ${levels[index + 1].name} returned the same entities for two different ${levels[index].name} parents. parentId is not limiting the child lookup.`,
      );
    }
    expect(overlap, `${kind} ${levels[index + 1].name} parentId`).toEqual([]);
    return;
  }
  throw new Error(`${kind} has no level with two parents`);
}

async function expectChildConsumersWithinParent(
  api: ApiClient,
  kind: 'organisation' | 'network',
  endpoint: string,
  queryKey: 'organisationLookupId' | 'networkLookupId',
): Promise<void> {
  const levels = await hierarchyLevels(api, kind);
  for (let index = 0; index < levels.length - 1; index += 1) {
    const parents = await lookupItems(api, endpoint, { hierarchyId: levels[index].id, limit: 10 });
    for (const parent of parents) {
      const children = await lookupItems(api, endpoint, {
        hierarchyId: levels[index + 1].id,
        parentId: parent.id,
        limit: 8,
      });
      if (children.length < 2) {
        continue;
      }
      const parentTotal = await listTotal(api, { [queryKey]: parent.id });
      if (parentTotal === 0) {
        continue;
      }
      const childRows: Array<{ label: string; total: number }> = [];
      for (const child of children) {
        childRows.push(await namedTotal(api, child.name, { [queryKey]: child.id }));
      }
      const sum = childRows.reduce((total, row) => total + row.total, 0);
      console.log(
        `CMD-003 API ${kind} ${parent.name} ${parentTotal}; children ${childRows.map((row) => `${row.label} ${row.total}`).join(' + ')} = ${sum}`,
      );
      for (const child of childRows) {
        expect.soft(child.total, `${child.label} inside ${parent.name}`).toBeLessThanOrEqual(parentTotal);
      }
      if (sum > parentTotal) {
        console.log(
          `ISSUE CMD-003 API: ${kind} children of ${parent.name} add up to ${sum}, which is above the parent total ${parentTotal}.`,
        );
      }
      expect.soft(sum, `${kind} children of ${parent.name}`).toBeLessThanOrEqual(parentTotal);
      return;
    }
  }
  throw new Error(`${kind} has no parent with consumers and two children`);
}

async function hierarchyLevels(api: ApiClient, kind: 'organisation' | 'network'): Promise<Array<{ id: number; name: string }>> {
  const result = await api.get('utilsHierarchies', { params: { kind }, expectedStatus: 200 });
  const body = expectAuthorizedContract(result, hierarchyListSchema, responseLimitMs, `${kind} hierarchies`);
  return [...body.data.items]
    .sort((left, right) => left.order - right.order || left.id - right.id)
    .map((item) => ({ id: item.id, name: item.name.trim() }));
}

async function expectValidation(api: ApiClient, query: Record<string, string | number | boolean>): Promise<void> {
  const result = await api.get<unknown>('consumerMasterData', {
    query: { limit: 1, ...query },
    expectedStatus: 400,
    timeout: listTimeout,
  });
  expectApiContract(result, validationErrorSchema, responseLimitMs, `invalid ${JSON.stringify(query)}`, { status: 400 });
}

async function namedTotals(
  api: ApiClient,
  items: Array<{ id: number; name: string }>,
  queryKey: string,
): Promise<Array<{ label: string; total: number }>> {
  const rows: Array<{ label: string; total: number }> = [];
  for (const item of items) {
    rows.push(await namedTotal(api, item.name, { [queryKey]: item.id }));
  }
  return rows;
}

async function namedTotal(
  api: ApiClient,
  label: string,
  query: Record<string, string | number | boolean>,
): Promise<{ label: string; total: number }> {
  return { label, total: await listTotal(api, query) };
}

async function listTotal(api: ApiClient, query: Record<string, string | number | boolean>): Promise<number> {
  const page = await readList(api, {
    meterType: 'all',
    totalsOnly: true,
    includeArchiveCounts: false,
    limit: 1,
    ...query,
  });
  return page.total;
}

async function readList(
  api: ApiClient,
  query: Record<string, string | number | boolean>,
): Promise<{ total: number; rows: Array<Record<string, unknown>> }> {
  const result = await list(api, query);
  const body = expectAuthorizedContract(result, masterListSchema, responseLimitMs, 'consumer list');
  return { total: totalCount(body.data, 'consumer list'), rows: rowsOf(body.data) };
}

function list(api: ApiClient, query: Record<string, string | number | boolean>): Promise<ApiResult<unknown>> {
  return api.get('consumerMasterData', { query, expectedStatus: 200, timeout: listTimeout });
}

async function lookupItems(
  api: ApiClient,
  endpoint: string,
  params?: Record<string, string | number>,
): Promise<Array<{ id: number; name: string }>> {
  const result = await api.get(endpoint, {
    params: params?.kind !== undefined ? { kind: String(params.kind) } : undefined,
    query: queryWithoutKind(params),
    expectedStatus: 200,
  });
  const body = expectAuthorizedContract(result, lookupListSchema, responseLimitMs, endpoint);
  return body.data.items.map((item) => ({ id: item.id, name: item.name.trim() }));
}

function queryWithoutKind(params?: Record<string, string | number>): Record<string, string | number> | undefined {
  if (!params) {
    return undefined;
  }
  const query = { ...params };
  delete query.kind;
  return Object.keys(query).length > 0 ? query : undefined;
}

function rowsOf(data: unknown): Array<Record<string, unknown>> {
  if (!isRecord(data)) {
    return [];
  }
  const raw = data.rows ?? data.items;
  return Array.isArray(raw) ? raw.filter(isRecord) : [];
}

function serialOf(row: Record<string, unknown> | undefined): string {
  const value = row?.meterSerialNumber ?? row?.meterSlNo ?? row?.serialNo;
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
}

function rowId(row: Record<string, unknown>): string {
  const value = row.id ?? row.consumerId ?? serialOf(row);
  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
