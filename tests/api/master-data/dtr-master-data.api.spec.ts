import ExcelJS from 'exceljs';
import { request as playwrightRequest } from '@playwright/test';
import { expect, functionality, test } from '../../../src/core/fixtures/test.fixtures';
import type { ExportPayload } from '../../../src/core/data/dataset.types';
import { ApiClient } from '../../../src/core/api/api.client';
import {
  apiDataSchema,
  errorSchema,
  exportJobSchema,
  hierarchyListSchema,
  loginSchema,
  lookupListSchema,
  meterCommunicationSchema,
  dtrMasterListSchema,
  notificationStatsSchema,
  permissionKeysSchema,
  permissionModulesSchema,
  sessionMeSchema,
  twoFactorDevicesSchema,
} from '../../../src/core/api/dashboard.schemas';
import { expectApiContract, expectAuthorizedContract, expectUnauthorized } from '../support/expect-dashboard-contract';

const openQuery = { page: 1, limit: 10 };
const columnKeys = [
  'slNo',
  'circle',
  'division',
  'zone',
  'subStation',
  'feederName',
  'feederCode',
  'dtrCode',
  'newDtrCode',
  'dtrCapacity',
  'meterSerialNumber',
  'meterMake',
  'mf',
  'latitude',
  'longitude',
  'serviceDate',
];
const rowKeys = [
  'id',
  'slNo',
  'circle',
  'division',
  'zone',
  'subStation',
  'feederCode',
  'feederName',
  'dtrCode',
  'newDtrCode',
  'dtrCapacity',
  'dtrName',
  'meterSerialNumber',
  'meterMake',
  'mf',
  'latitude',
  'longitude',
  'serviceDate',
  'meterLookupTblRefId',
];
const searchFields = ['dtrCode', 'newDtrCode', 'feederCode', 'feederName', 'meterSerialNumber'] as const;
const templateHeaders = [
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

test.describe('DTR master data API @master-data @regression', () => {
  functionality('Master Data');
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ api, data, env }) => {
    const login = await api.authenticate(data.user('validAdmin'));
    expectApiContract(login, loginSchema, env.timeouts.api, 'login', { authorized: false, hasBody: true });
  });

  test('DMA-001 the open list, page 2, search, and communication @smoke', async ({ api, env }) => {
    const first = await readDtrs(api, env.timeouts.api, openQuery);
    const total = first.data.pagination.total;
    const params = new URL(first.url).searchParams;
    expect(params.get('page')).toBe('1');
    expect(params.get('limit')).toBe('10');
    expect(params.has('q')).toBe(false);
    expect(params.has('isActive')).toBe(false);
    expect(params.has('mappingStatus')).toBe(false);
    expect(params.has('connection')).toBe(false);
    expect(params.has('communicationStatus')).toBe(false);
    expect(first.data.pagination.page).toBe(1);
    expect(first.data.pagination.limit).toBe(10);
    expect(first.data.pagination.totalPages).toBe(Math.ceil(total / 10));
    expect(first.data.rows.length).toBe(Math.min(10, total));
    expect(first.data.columns.map((column) => column.key)).toEqual(columnKeys);
    expect(first.data.columns).toHaveLength(16);
    const firstRow = first.data.rows[0] as Record<string, unknown>;
    expect(rowKeys.filter((key) => !(key in firstRow)), 'row keys').toEqual([]);

    if (total > 10) {
      const page2 = await readDtrs(api, env.timeouts.api, { ...openQuery, page: 2 });
      expect(page2.data.pagination.page).toBe(2);
      expect(page2.data.pagination.limit).toBe(10);
      expect(page2.data.pagination.total).toBe(total);
      expect(String(page2.data.rows[0]?.id)).not.toBe(String(first.data.rows[0]?.id));
    }

    const needle = searchNeedle(firstRow);
    expect(needle, 'search text').not.toBe('');
    const found = await readDtrs(api, env.timeouts.api, { ...openQuery, q: needle });
    expect(new URL(found.url).searchParams.get('q')).toBe(needle);
    expect(found.data.pagination.page).toBe(1);
    expect(found.data.pagination.total).toBeGreaterThan(0);
    expect(found.data.rows.every((row) => rowMatches(row as Record<string, unknown>, needle)), 'search rows contain q').toBe(true);

    const padded = await readDtrs(api, env.timeouts.api, { ...openQuery, q: `  ${needle}  ` });
    expect(padded.data.pagination.total, 'padded q matches the trimmed search').toBe(found.data.pagination.total);

    const blank = await readDtrs(api, env.timeouts.api, { ...openQuery, q: '   ' });
    expect(blank.data.pagination.total, 'a blank search does not filter').toBe(total);

    const missing = await readDtrs(api, env.timeouts.api, { ...openQuery, q: 'NO-SUCH-DTR-000' });
    expect(missing.data.pagination.total).toBe(0);
    expect(missing.data.rows).toHaveLength(0);

    const online = await readDtrs(api, env.timeouts.api, { ...openQuery, communicationStatus: 'communicating' });
    const offline = await readDtrs(api, env.timeouts.api, { ...openQuery, communicationStatus: 'non-communicating' });
    expect(online.data.pagination.total).toBeLessThanOrEqual(total);
    expect(offline.data.pagination.total).toBeLessThanOrEqual(total);
    console.log(
      `DMA-001 communication: Online ${online.data.pagination.total} + Offline ${offline.data.pagination.total} against unfiltered ${total}.`,
    );

    const onlineSerial = String(online.data.rows[0]?.meterSerialNumber ?? '').trim();
    if (onlineSerial) {
      const kept = await readDtrs(api, env.timeouts.api, { ...openQuery, q: onlineSerial, communicationStatus: 'communicating' });
      const keptParams = new URL(kept.url).searchParams;
      expect(keptParams.get('q')).toBe(onlineSerial);
      expect(keptParams.get('communicationStatus')).toBe('communicating');
      expect(kept.data.pagination.total).toBeGreaterThan(0);
      const opposite = await readDtrs(api, env.timeouts.api, { ...openQuery, q: onlineSerial, communicationStatus: 'non-communicating' });
      expect(opposite.data.pagination.total, `${onlineSerial} is not also offline`).toBe(0);
    }
    const offlineSerial = String(offline.data.rows[0]?.meterSerialNumber ?? '').trim();
    if (offlineSerial) {
      const opposite = await readDtrs(api, env.timeouts.api, { ...openQuery, q: offlineSerial, communicationStatus: 'communicating' });
      expect(opposite.data.pagination.total, `${offlineSerial} is not also online`).toBe(0);
    }
  });

  test('DMA-001 limits, the last page, a page past the end, metric, and selected ids', async ({ api, env }) => {
    const open = await readDtrs(api, env.timeouts.api, openQuery);
    const total = open.data.pagination.total;
    for (const limit of [20, 50]) {
      const page = await readDtrs(api, env.timeouts.api, { page: 1, limit });
      expect(page.data.pagination.limit).toBe(limit);
      expect(page.data.pagination.totalPages).toBe(Math.ceil(total / limit));
      expect(page.data.rows.length).toBeLessThanOrEqual(limit);
      expect(page.data.rows.length).toBe(Math.min(limit, total));
    }

    if (total > 0) {
      const lastPage = open.data.pagination.totalPages;
      const last = await readDtrs(api, env.timeouts.api, { ...openQuery, page: lastPage });
      const remainder = total % 10;
      expect(last.data.pagination.page).toBe(lastPage);
      expect(last.data.rows.length).toBe(remainder === 0 ? 10 : remainder);
    }

    const past = await readDtrs(api, env.timeouts.api, { ...openQuery, page: open.data.pagination.totalPages + 5 });
    const emptyPastEnd = past.data.rows.length === 0;
    const clampedToLast = past.data.pagination.page === Math.max(open.data.pagination.totalPages, 1) && past.data.rows.length > 0;
    expect(emptyPastEnd || clampedToLast, `page past the end returned page ${past.data.pagination.page} with ${past.data.rows.length} rows`).toBe(true);

    const metric = await readDtrs(api, env.timeouts.api, { ...openQuery, metric: 'DTRs ON' });
    const metricParams = new URL(metric.url).searchParams;
    expect(metricParams.get('metric')).toBe('DTRs ON');
    expect(metricParams.has('communicationStatus'), 'metric is not sent with communicationStatus').toBe(false);
    console.log(`DMA-001 metric DTRs ON total ${metric.data.pagination.total}.`);

    const lookupId = positiveId(open.data.rows[0]?.meterLookupTblRefId);
    expect(lookupId, 'meter lookup id').toBeGreaterThan(0);
    const selected = await readDtrs(api, env.timeouts.api, { ...openQuery, selectedIds: lookupId });
    expect(selected.data.pagination.total).toBeGreaterThan(0);
    expect(
      selected.data.rows.every((row) => positiveId((row as { meterLookupTblRefId?: unknown }).meterLookupTblRefId) === lookupId),
      'selectedIds keeps that meter',
    ).toBe(true);

    const emptySelection = await readDtrs(api, env.timeouts.api, { ...openQuery, selectedIds: '' });
    expect(emptySelection.data.pagination.total, 'an empty selectedIds list matches no rows').toBe(0);
    expect(emptySelection.data.rows).toHaveLength(0);
  });

  test('DMA-002 communication status covers the serials on the page', async ({ api, env }) => {
    const page = await readDtrs(api, env.timeouts.api, openQuery);
    const serials = page.data.rows.map((row) => String(row.meterSerialNumber ?? '').trim()).filter((serial) => serial.length > 0);
    expect(serials.length, 'serials').toBeGreaterThan(0);
    const result = await api.get('meterCommunicationStatus', {
      query: { limit: serials.length, meterSerialNumbers: serials.join(',') },
      expectedStatus: 200,
      timeout: 60_000,
    });
    const body = expectAuthorizedContract(result, meterCommunicationSchema, env.timeouts.api, 'dtr communication');
    expect(body.data.communicatingCount + body.data.nonCommunicatingCount).toBe(body.data.activeMeters);
    const pagination = body.data.pagination as { limit?: number; total: number };
    expect(pagination.limit).toBe(serials.length);
    const raw = result.body as { data?: { columns?: Array<{ key?: string }> } };
    expect(raw.data?.columns?.map((column) => column.key)).toEqual([
      'slNo',
      'meterSerialNumber',
      'communicationStatus',
      'lastCommunication',
    ]);
    const returned = new Set(body.data.rows.map((row) => row.meterSerialNumber).filter((serial): serial is string => !!serial));
    for (const serial of serials) {
      expect(returned.has(serial), serial).toBe(true);
    }
  });

  test('DMA-003 organisation and network hierarchy levels', async ({ api, env }) => {
    const openTotal = (await readDtrs(api, env.timeouts.api, openQuery)).data.pagination.total;
    for (const kind of ['organisation', 'network'] as const) {
      const result = await api.get('utilsHierarchies', { params: { kind }, expectedStatus: 200 });
      const body = expectAuthorizedContract(result, hierarchyListSchema, env.timeouts.api, `${kind} hierarchies`);
      expect(body.data.items.length, kind).toBeGreaterThan(0);
      expect(body.data.items.every((item) => item.id > 0 && item.name.trim().length > 0 && Number.isFinite(item.order))).toBe(true);
      const endpoint = kind === 'organisation' ? 'utilsSearchOrganisations' : 'utilsSearchNetworks';
      const search = await api.get(endpoint, {
        query: { hierarchyId: body.data.items[0].id, limit: 10 },
        expectedStatus: 200,
      });
      const lookup = expectAuthorizedContract(search, lookupListSchema, env.timeouts.api, `${kind} search`);
      const entityId = lookup.data.items?.[0]?.id;
      if (!entityId) {
        console.log(`ISSUE DMA-003: ${kind} hierarchy ${body.data.items[0].id} returned no entities, so the DTR list was not filtered.`);
        continue;
      }
      const param = kind === 'organisation' ? 'organisationLookupId' : 'networkLookupId';
      const other = kind === 'organisation' ? 'networkLookupId' : 'organisationLookupId';
      const filtered = await readDtrs(api, env.timeouts.api, { ...openQuery, [param]: entityId });
      const params = new URL(filtered.url).searchParams;
      expect(params.get(param)).toBe(String(entityId));
      expect(params.has(other)).toBe(false);
      expect(filtered.data.pagination.total, `${kind} total`).toBeLessThanOrEqual(openTotal);
    }
  });

  test('DMA-004 a one-code filtered export is an xlsx', async ({ api, env, data }) => {
    const page = await readDtrs(api, env.timeouts.api, openQuery);
    const code = String(page.data.rows[0]?.newDtrCode ?? page.data.rows[0]?.dtrCode ?? '').trim();
    expect(code).not.toBe('');
    const matched = await readDtrs(api, env.timeouts.api, { ...openQuery, q: code });
    const exportedBody = data.payload<ExportPayload>('payloads/exports.json', 'dtrFiltered');
    exportedBody.filters = { q: code };
    exportedBody.columns = columnKeys;
    expect(exportedBody.filters).not.toHaveProperty('page');
    expect(exportedBody.filters).not.toHaveProperty('limit');
    const exported = await api.post('consumerMasterExport', {
      data: exportedBody,
      failOnStatus: false,
      timeout: 60_000,
    });
    expect(exported.durationMs).toBeLessThanOrEqual(env.timeouts.api);
    expect(exported.requestHeaders.Authorization).toMatch(/^Bearer\s+\S+/);
    if (exported.status === 202) {
      exportJobSchema.parse(exported.body);
      console.log('ISSUE DMA-004: a one-code export was queued. The file was not downloaded, so the row count was not checked.');
    }
    expect(exported.status, 'one-code export streams the file').toBe(200);
    expect(exported.contentType).toMatch(/spreadsheetml/i);
    const rows = await sheetRows(exported.body);
    expect(rows[0], 'export headers').toEqual(page.data.columns.map((column) => String((column as { header?: string }).header ?? column.key)));
    expect(rows.length - 1).toBe(matched.data.pagination.total);
  });

  test('DMA-004 selected export and a filtered export of more than one row', async ({ api, env, data }) => {
    const page = await readDtrs(api, env.timeouts.api, openQuery);
    const selectedId = positiveId(page.data.rows[0]?.meterLookupTblRefId);
    expect(selectedId, 'selected id').toBeGreaterThan(0);
    const selectedBody = data.payload<ExportPayload>('payloads/exports.json', 'dtrSelected');
    selectedBody.selectedIds = [selectedId];
    selectedBody.columns = columnKeys;
    const selected = await api.post('consumerMasterExport', {
      data: selectedBody,
      failOnStatus: false,
      timeout: 60_000,
    });
    expect(selected.status, 'selected export').toBe(200);
    const selectedRows = await sheetRows(selected.body);
    expect(selectedRows[0]).toEqual(page.data.columns.map((column) => String((column as { header?: string }).header ?? column.key)));
    expect(selectedRows.length - 1, 'selected export rows').toBe(1);

    const narrow = await narrowExport(api, env.timeouts.api);
    expect(narrow.filters).not.toHaveProperty('page');
    expect(narrow.filters).not.toHaveProperty('limit');
    const filteredBody = data.payload<ExportPayload>('payloads/exports.json', 'dtrFiltered');
    filteredBody.filters = narrow.filters;
    filteredBody.columns = columnKeys;
    const exported = await api.post('consumerMasterExport', {
      data: filteredBody,
      failOnStatus: false,
      timeout: 120_000,
    });
    expect(exported.status, 'filtered export').toBe(200);
    const rows = await sheetRows(exported.body);
    expect(rows.length - 1, 'filtered export row count').toBe(narrow.total);
    expect(narrow.total).toBeGreaterThan(1);
  });

  test('DMA-005 the bulk template is the DTR workbook', async ({ api, env }) => {
    const file = await api.get('dtrBulkTemplate', { expectedStatus: 200, timeout: 60_000 });
    expect(file.durationMs).toBeLessThanOrEqual(env.timeouts.api);
    expect(file.contentType).toMatch(/spreadsheetml/i);
    expect(Buffer.isBuffer(file.body) ? file.body.subarray(0, 2).toString() : String(file.body).slice(0, 2)).toBe('PK');
    const [headers] = await sheetRows(file.body);
    if (headers.join('\n') !== templateHeaders.join('\n')) {
      console.log(`ISSUE DMA-005: template headers are ${JSON.stringify(headers)}. Coverage requires ${JSON.stringify(templateHeaders)}.`);
    }
    expect(headers, 'ISSUE DMA-005 template headers').toEqual(templateHeaders);
  });

  test('DMA-006 a rejected import does not change the list total', async ({ api, env }) => {
    const before = (await readDtrs(api, env.timeouts.api, openQuery)).data.pagination.total;
    const csv = await api.post('dtrBulkUpload', {
      multipart: {
        conflictMode: 'merge',
        file: { name: 'dtrs.csv', mimeType: 'text/csv', buffer: Buffer.from('not a workbook') },
      },
      failOnStatus: false,
      timeout: 60_000,
    });
    expectRejected(csv, 'csv');
    const files: Array<{ name: string; rows: string[][] }> = [
      { name: 'missing-header.xlsx', rows: [templateHeaders.filter((header) => header !== 'DTR Code'), ['x']] },
      { name: 'headers-only.xlsx', rows: [templateHeaders] },
      { name: 'empty.xlsx', rows: [] },
      { name: 'duplicate-header.xlsx', rows: [[...templateHeaders, 'dtr code'], templateHeaders.map(() => '')] },
    ];
    for (const file of files) {
      const rejected = await api.post('dtrBulkUpload', {
        multipart: {
          conflictMode: 'merge',
          file: {
            name: file.name,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            buffer: await sheetBuffer(file.rows),
          },
        },
        failOnStatus: false,
        timeout: 60_000,
      });
      expectRejected(rejected, file.name);
    }
    const after = await readDtrs(api, env.timeouts.api, openQuery);
    expect(after.data.pagination.total, 'rejected files do not change the list').toBe(before);
  });

  test('the signed-in shell calls return 200', async ({ api, env }) => {
    const me = expectAuthorizedContract(await api.get('authMe', { expectedStatus: 200 }), sessionMeSchema, env.timeouts.api, 'auth me');
    const keys = expectAuthorizedContract(
      await api.get('myPermissions', { expectedStatus: 200 }),
      permissionKeysSchema,
      env.timeouts.api,
      'permissions',
    );
    expect(keys.data.permissions, 'dtrs.view').toContain('dtrs.view');
    const modules = expectAuthorizedContract(
      await api.get('myPermissionModules', { expectedStatus: 200 }),
      permissionModulesSchema,
      env.timeouts.api,
      'modules',
    );
    expect(modules.data.modules.length).toBeGreaterThan(0);
    expectAuthorizedContract(await api.post('authRefresh', { expectedStatus: 200 }), apiDataSchema, env.timeouts.api, 'refresh');
    expectAuthorizedContract(await api.get('permissionRoles', { expectedStatus: 200 }), apiDataSchema, env.timeouts.api, 'roles');
    expectAuthorizedContract(await api.get('notificationStats', { expectedStatus: 200 }), notificationStatsSchema, env.timeouts.api, 'notifications');
    expectAuthorizedContract(await api.get('auth2faDevices', { expectedStatus: 200 }), twoFactorDevicesSchema, env.timeouts.api, '2fa devices');
    const userId = String((me.data.user as { id?: unknown }).id ?? '');
    expect(userId, 'signed-in user id').not.toBe('');
    expectAuthorizedContract(
      await api.get('userById', { params: { id: userId }, expectedStatus: 200 }),
      apiDataSchema,
      env.timeouts.api,
      'user',
    );
  });
});

test.describe('DTR master data API security @master-data @regression', () => {
  functionality('Master Data');

  test('DTR reads and shell reads reject a missing token and a bad bearer', async ({ request, app, env }) => {
    const anonymous = new ApiClient(request, app, env);
    const reads: Array<{ endpoint: string; options?: Parameters<ApiClient['get']>[1] }> = [
      { endpoint: 'dtrMasterData', options: { query: openQuery } },
      { endpoint: 'meterCommunicationStatus' },
      { endpoint: 'dtrBulkTemplate' },
      { endpoint: 'utilsHierarchies', options: { params: { kind: 'organisation' } } },
      { endpoint: 'utilsSearchOrganisations', options: { query: { hierarchyId: 1, limit: 1 } } },
      { endpoint: 'utilsSearchNetworks', options: { query: { hierarchyId: 1, limit: 1 } } },
      { endpoint: 'notificationStats' },
      { endpoint: 'auth2faDevices' },
      { endpoint: 'authMe' },
      { endpoint: 'myPermissions' },
    ];
    for (const read of reads) {
      const missing = await anonymous.get(read.endpoint, { ...read.options, expectedStatus: 401 });
      expectUnauthorized(missing, env.timeouts.api, `${read.endpoint} missing token`);
      const forged = await anonymous.get(read.endpoint, {
        ...read.options,
        headers: { Authorization: 'Bearer not-a-token' },
        expectedStatus: 401,
      });
      expectUnauthorized(forged, env.timeouts.api, `${read.endpoint} bad bearer`, { sentToken: true });
    }
  });

  test('DTR export and DTR upload reject a missing token and a bad bearer', async ({ app, env, data }) => {
    const context = await playwrightRequest.newContext();
    const anonymous = new ApiClient(context, app, env);
    try {
      await anonymous.get('dtrMasterData', { query: openQuery, failOnStatus: false });
      const posts: Array<{ endpoint: string; options: Parameters<ApiClient['post']>[1] }> = [
        {
          endpoint: 'consumerMasterExport',
          options: { data: data.payload<ExportPayload>('payloads/exports.json', 'dtrUnauthorized') },
        },
        {
          endpoint: 'dtrBulkUpload',
          options: {
            multipart: {
              conflictMode: 'merge',
              file: { name: 'dtrs.csv', mimeType: 'text/csv', buffer: Buffer.from('not a workbook') },
            },
          },
        },
      ];
      for (const post of posts) {
        const missing = await anonymous.post(post.endpoint, { ...post.options, failOnStatus: false });
        expectUnauthorized(missing, env.timeouts.api, `${post.endpoint} missing token`);
        const forged = await anonymous.post(post.endpoint, {
          ...post.options,
          headers: { Authorization: 'Bearer not-a-token' },
          failOnStatus: false,
        });
        expectUnauthorized(forged, env.timeouts.api, `${post.endpoint} bad bearer`, { sentToken: true });
      }
    } finally {
      await context.dispose();
    }
  });

  test('export without a CSRF cookie returns 403 CSRF_MISSING', async ({ app, env, data }) => {
    const context = await playwrightRequest.newContext();
    try {
      const anonymous = new ApiClient(context, app, env);
      const rejected = await anonymous.post('consumerMasterExport', {
        data: data.payload<ExportPayload>('payloads/exports.json', 'dtrUnauthorized'),
        failOnStatus: false,
      });
      const body = expectApiContract(rejected, errorSchema, env.timeouts.api, 'export without csrf', {
        status: 403,
        authorized: false,
        hasBody: true,
      });
      expect(body.error.code).toBe('CSRF_MISSING');
    } finally {
      await context.dispose();
    }
  });
});

async function readDtrs(api: ApiClient, limitMs: number, query: Record<string, string | number>) {
  const result = await api.get('dtrMasterData', { query, expectedStatus: 200, timeout: 60_000 });
  const body = expectAuthorizedContract(result, dtrMasterListSchema, limitMs, 'dtr list');
  return Object.assign(body, { url: result.url });
}

function searchNeedle(row: Record<string, unknown>): string {
  for (const field of ['newDtrCode', 'dtrCode', 'feederCode', 'meterSerialNumber'] as const) {
    const value = String(row[field] ?? '').trim();
    if (value) return value;
  }
  return '';
}

function rowMatches(row: Record<string, unknown>, needle: string): boolean {
  const folded = needle.toLowerCase();
  return searchFields.some((field) => String(row[field] ?? '').toLowerCase().includes(folded));
}

function positiveId(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return 0;
}

function expectRejected(result: { status: number; body: unknown }, name: string): void {
  const body = result.body as { success?: boolean };
  if (result.status >= 200 && result.status < 300) {
    expect(body.success, `${name} must not import`).not.toBe(true);
    return;
  }
  expect([400, 415, 422], name).toContain(result.status);
}

async function narrowExport(api: ApiClient, limitMs: number): Promise<{ filters: Record<string, string>; total: number }> {
  const page = await readDtrs(api, limitMs, openQuery);
  const needles = [...new Set(
    page.data.rows.flatMap((row) => {
      const record = row as Record<string, unknown>;
      return ['feederCode', 'feederName', 'dtrCode'].map((field) => String(record[field] ?? '').trim());
    }).filter((value) => value.length >= 2),
  )];
  const scopes: Array<Record<string, string>> = [
    { communicationStatus: 'non-communicating' },
    { communicationStatus: 'communicating' },
    {},
  ];
  let smallest: { filters: Record<string, string>; total: number } | undefined;
  const consider = (filters: Record<string, string>, total: number) => {
    if (total > 1 && (!smallest || total < smallest.total)) {
      smallest = { filters, total };
    }
  };
  for (const q of needles) {
    for (const scope of scopes) {
      const found = await readDtrs(api, limitMs, { ...openQuery, q, ...scope });
      consider({ q, ...scope }, found.data.pagination.total);
      if (smallest && smallest.total <= 40 && (smallest.filters.communicationStatus || smallest.filters.organisationLookupId)) {
        return smallest;
      }
    }
  }
  const levels = await api.get('utilsHierarchies', { params: { kind: 'organisation' }, expectedStatus: 200 });
  const hierarchy = expectAuthorizedContract(levels, hierarchyListSchema, limitMs, 'organisation hierarchies');
  const levelId = hierarchy.data.items[0]?.id;
  if (levelId) {
    const search = await api.get('utilsSearchOrganisations', {
      query: { hierarchyId: levelId, limit: 15 },
      expectedStatus: 200,
    });
    const lookup = expectAuthorizedContract(search, lookupListSchema, limitMs, 'organisation search');
    for (const item of lookup.data.items.slice(0, 8)) {
      const found = await readDtrs(api, limitMs, {
        ...openQuery,
        organisationLookupId: item.id,
        communicationStatus: 'non-communicating',
      });
      consider(
        { organisationLookupId: String(item.id), communicationStatus: 'non-communicating' },
        found.data.pagination.total,
      );
      if (smallest && smallest.total <= 40) return smallest;
    }
  }
  if (smallest && smallest.total <= 200) return smallest;
  throw new Error('No DTR filter returned between 2 and 200 rows, so a multi-row export was not sent.');
}

async function sheetRows(body: unknown): Promise<string[][]> {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body as ArrayBuffer);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);
  const rows: string[][] = [];
  workbook.worksheets[0]?.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: false }, (cell) => cells.push(String(cell.text ?? cell.value ?? '').trim()));
    if (cells.some((cell) => cell.length > 0)) rows.push(cells);
  });
  return rows;
}

async function sheetBuffer(rows: string[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('DTRs');
  for (const row of rows) sheet.addRow(row);
  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out);
}
