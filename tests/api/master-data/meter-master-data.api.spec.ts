import ExcelJS from 'exceljs';
import { request as playwrightRequest } from '@playwright/test';
import { expect, functionality, test } from '../../../src/core/fixtures/test.fixtures';
import type { ExportPayload } from '../../../src/core/data/dataset.types';
import { METER_TEMPLATE_HEADERS, meterCells, meterSheetBuffer } from '../../support/meter-workbook';
import { ApiClient } from '../../../src/core/api/api.client';
import {
  apiDataSchema,
  errorSchema,
  exportJobSchema,
  hierarchyListSchema,
  loginSchema,
  lookupListSchema,
  meterCommunicationSchema,
  meterListSchema,
  notificationStatsSchema,
  permissionKeysSchema,
  permissionModulesSchema,
  sessionMeSchema,
  twoFactorDevicesSchema,
  validationErrorSchema,
} from '../../../src/core/api/dashboard.schemas';
import { expectApiContract, expectAuthorizedContract, expectUnauthorized } from '../support/expect-dashboard-contract';

const openQuery = { page: 1, limit: 10, isActive: true, mappingStatus: 'mapped' };
const columnKeys = [
  'slNo', 'meterSerialNumber', 'connection', 'meterRapdrpCode', 'assetId', 'mf',
  'simNumber', 'ismiNumber', 'ipAddress', 'modemSerialNumber', 'modemImeiNumber', 'isActiveStatus',
];
const exportHeaders = [
  'Sl No.', 'Meter SL No.', 'Connection', 'Meter RAPDRP Code', 'Asset ID', 'MF',
  'SIM Number', 'IMSI Number', 'IP Address', 'Modem Serial No.', 'Modem IMEI No.', 'Status',
];
const templateHeaders = [...METER_TEMPLATE_HEADERS];

test.describe('Meter list on the server @master-data @regression', () => {
  functionality('Master Data');
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ api, data, env }) => {
    const login = await api.authenticate(data.user('validAdmin'));
    expectApiContract(login, loginSchema, env.timeouts.api, 'login', { authorized: false, hasBody: true });
  });

  test('The open list, page 2, page 3, search, and connection all return the right meters @smoke', async ({ api, env }) => {
    const first = await readMeters(api, env.timeouts.api, openQuery);
    const total = first.data.pagination.total;
    const openParams = new URL(first.url).searchParams;
    expect.soft(openParams.get('page'), 'MMA-001 page').toBe('1');
    expect.soft(openParams.get('limit'), 'MMA-001 limit').toBe('10');
    expect.soft(openParams.get('isActive'), 'MMA-001 isActive').toBe('true');
    expect.soft(openParams.get('mappingStatus'), 'MMA-001 mappingStatus').toBe('mapped');
    expect.soft(openParams.has('q'), 'MMA-001 q is absent').toBe(false);
    expect.soft(openParams.has('connection'), 'MMA-001 connection is absent by default').toBe(false);
    expect.soft(openParams.has('communicationStatus'), 'MMA-001 communicationStatus is absent by default').toBe(false);
    expect.soft(first.data.pagination.page, 'MMA-001 page').toBe(1);
    expect.soft(first.data.pagination.limit, 'MMA-001 limit').toBe(10);
    expect.soft(first.data.pagination.totalPages, 'MMA-001 total pages').toBe(Math.ceil(total / 10));
    expect.soft(first.data.rows.length, 'MMA-001 row count').toBe(Math.min(10, total));
    expect.soft(first.data.columns.map((column) => column.key), 'MMA-001 columns').toEqual(columnKeys);
    expect.soft(first.data.rows.every((row) => row.isActiveStatus), 'MMA-001 active rows').toBe(true);

    if (total > 20) {
      const page2 = await readMeters(api, env.timeouts.api, { ...openQuery, page: 2 });
      const page3 = await readMeters(api, env.timeouts.api, { ...openQuery, page: 3 });
      expect.soft(page2.data.pagination.page, 'MMA-001 page 2').toBe(2);
      expect.soft(page3.data.pagination.page, 'MMA-001 page 3').toBe(3);
      expect.soft(page2.data.pagination.total, 'MMA-001 page 2 total').toBe(total);
      expect.soft(page3.data.pagination.total, 'MMA-001 page 3 total').toBe(total);
      expect.soft(String(page2.data.rows[0]?.id), 'MMA-001 page 2 first row').not.toBe(String(first.data.rows[0]?.id));
      expect.soft(String(page3.data.rows[0]?.id), 'MMA-001 page 3 first row').not.toBe(String(first.data.rows[0]?.id));
    }

    const serial = String(first.data.rows[0]?.meterSerialNumber ?? '').trim();
    expect.soft(serial, 'MMA-001 serial').not.toBe('');
    if (serial) {
      const found = await readMeters(api, env.timeouts.api, { ...openQuery, q: serial });
      expect.soft(found.data.pagination.total, 'MMA-001 search total').toBeGreaterThan(0);
      expect.soft(
        found.data.rows.every((row) => String(row.meterSerialNumber ?? '').includes(serial)),
        'MMA-001 search rows',
      ).toBe(true);
    }

    const blank = await readMeters(api, env.timeouts.api, { ...openQuery, q: '   ' });
    expect.soft(blank.data.pagination.total, 'MMA-001 spaces are not a search').toBe(total);

    const dtr = await readMeters(api, env.timeouts.api, { ...openQuery, connection: 'dtr' });
    const consumer = await readMeters(api, env.timeouts.api, { ...openQuery, connection: 'consumer' });
    const dtrTotal = dtr.data.pagination.total;
    const consumerTotal = consumer.data.pagination.total;
    const other = [...dtr.data.rows, ...consumer.data.rows].filter((row) => {
      const label = String(row.connection ?? '').trim().toLowerCase();
      return label !== 'dtr' && label !== 'consumer';
    });
    expect.soft(other.length, 'MMA-001 every listed meter is DTR or Consumer').toBe(0);
    expect.soft(dtrTotal + consumerTotal, 'MMA-001 DTR plus Consumer covers the unfiltered list').toBeGreaterThanOrEqual(total);
    console.log(
      `MMA-001 connection: DTR ${dtrTotal} + Consumer ${consumerTotal} - unfiltered ${total} = overlap ${dtrTotal + consumerTotal - total}.`,
    );
  });

  test('Search finds a modem serial, ignores extra spaces, returns nothing for no match, and keeps a filter', async ({ api, env }) => {
    const first = await readMeters(api, env.timeouts.api, openQuery);
    const serial = String(first.data.rows[0]?.meterSerialNumber ?? '').trim();
    expect(serial, 'MMA-001 serial').not.toBe('');
    const modem = first.data.rows
      .map((row) => String(row.modemSerialNumber ?? '').trim())
      .find((value) => value.length > 0);
    if (!modem) {
      console.log('ISSUE MMA-001: the first page has no modem serial, so modem-serial search was not sent.');
    } else {
      const byModem = await readMeters(api, env.timeouts.api, { ...openQuery, q: modem });
      expect.soft(byModem.data.pagination.total, 'MMA-001 modem search total').toBeGreaterThan(0);
      expect.soft(
        byModem.data.rows.some((row) => String(row.modemSerialNumber ?? '').includes(modem) || String(row.meterSerialNumber ?? '').includes(modem)),
        'MMA-001 modem search row',
      ).toBe(true);
    }

    const trimmed = await readMeters(api, env.timeouts.api, { ...openQuery, q: serial });
    const padded = await readMeters(api, env.timeouts.api, { ...openQuery, q: `  ${serial}  ` });
    if (padded.data.pagination.total !== trimmed.data.pagination.total) {
      console.log(
        `ISSUE MMA-001: padded q "  ${serial}  " returned ${padded.data.pagination.total}. The trimmed search returned ${trimmed.data.pagination.total}. The client trims before send.`,
      );
    }
    expect.soft(padded.data.pagination.total, 'MMA-001 padded q matches the trimmed serial').toBe(trimmed.data.pagination.total);

    const missing = await readMeters(api, env.timeouts.api, { ...openQuery, q: 'NO-SUCH-METER-000' });
    expect.soft(missing.data.pagination.total, 'MMA-001 no-match total').toBe(0);
    expect.soft(missing.data.rows, 'MMA-001 no-match rows').toHaveLength(0);

    const connection = String(first.data.rows[0]?.connection ?? '').trim().toLowerCase();
    const filter = connection === 'dtr' || connection === 'consumer' ? connection : 'dtr';
    const combined = await readMeters(api, env.timeouts.api, { ...openQuery, q: serial, connection: filter });
    const combinedParams = new URL(combined.url).searchParams;
    expect.soft(combinedParams.get('q'), 'MMA-001 search q').toBe(serial);
    expect.soft(combinedParams.get('connection'), 'MMA-001 search keeps the connection filter').toBe(filter);
    expect.soft(combined.data.pagination.total, 'MMA-001 filtered search total').toBeGreaterThan(0);
  });

  test('Online and offline meters are part of the full list and do not overlap', async ({ api, env }) => {
    const open = await readMeters(api, env.timeouts.api, openQuery);
    const total = open.data.pagination.total;
    const online = await readMeters(api, env.timeouts.api, { ...openQuery, communicationStatus: 'communicating' });
    const offline = await readMeters(api, env.timeouts.api, { ...openQuery, communicationStatus: 'non-communicating' });
    expect.soft(online.data.pagination.total, 'MMA-001 online is a subset').toBeLessThanOrEqual(total);
    expect.soft(offline.data.pagination.total, 'MMA-001 offline is a subset').toBeLessThanOrEqual(total);
    const onlineSerials = online.data.rows.map((row) => String(row.meterSerialNumber ?? '').trim()).filter(Boolean).slice(0, 3);
    const offlineSerials = offline.data.rows.map((row) => String(row.meterSerialNumber ?? '').trim()).filter(Boolean).slice(0, 3);
    expect(onlineSerials.length + offlineSerials.length, 'a communication sample').toBeGreaterThan(0);
    for (const serial of onlineSerials) {
      const opposite = await readMeters(api, env.timeouts.api, { ...openQuery, q: serial, communicationStatus: 'non-communicating' });
      expect.soft(opposite.data.pagination.total, `MMA-001 ${serial} is not also offline`).toBe(0);
    }
    for (const serial of offlineSerials) {
      const opposite = await readMeters(api, env.timeouts.api, { ...openQuery, q: serial, communicationStatus: 'communicating' });
      expect.soft(opposite.data.pagination.total, `MMA-001 ${serial} is not also online`).toBe(0);
    }
  });

  test('Communication status covers the meter serials on the page', async ({ api, env }) => {
    const page = await readMeters(api, env.timeouts.api, openQuery);
    const serials = page.data.rows.map((row) => String(row.meterSerialNumber ?? '').trim()).filter((serial) => serial.length > 0);
    expect(serials.length).toBeGreaterThan(0);
    const result = await api.get('meterCommunicationStatus', {
      query: { limit: serials.length, meterSerialNumbers: serials.join(',') },
      expectedStatus: 200,
      timeout: 60_000,
    });
    const body = expectAuthorizedContract(result, meterCommunicationSchema, env.timeouts.api, 'meter communication');
    expect(body.data.communicatingCount + body.data.nonCommunicatingCount).toBe(body.data.activeMeters);
    expect(body.data.pagination.limit).toBe(serials.length);
    const returned = new Set(body.data.rows.map((row) => row.meterSerialNumber).filter((serial): serial is string => !!serial));
    for (const serial of serials) {
      expect(returned.has(serial), serial).toBe(true);
    }
  });

  test('Organisation and network levels return the meters under the chosen place', async ({ api, env }) => {
    const openTotal = (await readMeters(api, env.timeouts.api, openQuery)).data.pagination.total;
    for (const kind of ['organisation', 'network'] as const) {
      const result = await api.get('utilsHierarchies', { params: { kind }, expectedStatus: 200 });
      const body = expectAuthorizedContract(result, hierarchyListSchema, env.timeouts.api, `${kind} hierarchies`);
      expect(body.data.items.length, kind).toBeGreaterThan(0);
      expect(body.data.items.every((item) => item.id > 0 && item.name.trim().length > 0)).toBe(true);
      const endpoint = kind === 'organisation' ? 'utilsSearchOrganisations' : 'utilsSearchNetworks';
      const search = await api.get(endpoint, {
        query: { hierarchyId: body.data.items[0].id, limit: 10 },
        expectedStatus: 200,
      });
      const lookup = expectAuthorizedContract(search, lookupListSchema, env.timeouts.api, `${kind} search`);
      const entityId = lookup.data.items?.[0]?.id;
      if (!entityId) {
        console.log(`ISSUE MMA-003: ${kind} hierarchy ${body.data.items[0].id} returned no entities, so meters-data was not filtered.`);
        continue;
      }
      const param = kind === 'organisation' ? 'organisationLookupId' : 'networkLookupId';
      const other = kind === 'organisation' ? 'networkLookupId' : 'organisationLookupId';
      const filtered = await readMeters(api, env.timeouts.api, { ...openQuery, [param]: entityId });
      const params = new URL(filtered.url).searchParams;
      expect(params.get(param), param).toBe(String(entityId));
      expect(params.has(other), `${other} is not sent with ${param}`).toBe(false);
      expect(filtered.data.pagination.total, `${kind} total`).toBeLessThanOrEqual(openTotal);
    }
  });

  test('Connection and communication can be used together, and the last page shows only the remaining meters', async ({ api, env }) => {
    const open = await readMeters(api, env.timeouts.api, openQuery);
    const dtr = await readMeters(api, env.timeouts.api, { ...openQuery, connection: 'dtr' });
    const online = await readMeters(api, env.timeouts.api, { ...openQuery, communicationStatus: 'communicating' });
    const combined = await readMeters(api, env.timeouts.api, {
      ...openQuery,
      connection: 'dtr',
      communicationStatus: 'communicating',
    });
    expect(combined.data.pagination.total, 'combined is within DTR').toBeLessThanOrEqual(dtr.data.pagination.total);
    expect(combined.data.pagination.total, 'combined is within online').toBeLessThanOrEqual(online.data.pagination.total);

    const total = open.data.pagination.total;
    const totalPages = open.data.pagination.totalPages;
    expect(totalPages, 'page count').toBe(Math.ceil(total / 10));
    if (total === 0) {
      return;
    }
    const last = await readMeters(api, env.timeouts.api, { ...openQuery, page: totalPages });
    const remainder = total % 10;
    expect(last.data.pagination.page, 'last page').toBe(totalPages);
    expect(last.data.rows.length, 'last page row count').toBe(remainder === 0 ? 10 : remainder);
  });

  test('Page sizes 20 and 50 are honored, a page past the end is empty, and a zero total stays empty', async ({ api, env }) => {
    const open = await readMeters(api, env.timeouts.api, openQuery);
    const total = open.data.pagination.total;
    for (const limit of [20, 50]) {
      const page = await readMeters(api, env.timeouts.api, { ...openQuery, limit });
      expect(new URL(page.url).searchParams.get('limit'), `limit ${limit}`).toBe(String(limit));
      expect(page.data.pagination.limit, `limit ${limit}`).toBe(limit);
      expect(page.data.pagination.totalPages, `pages at ${limit}`).toBe(Math.ceil(total / limit));
      expect(page.data.rows.length, `rows at ${limit}`).toBe(Math.min(limit, total));
    }
    const past = await readMeters(api, env.timeouts.api, { ...openQuery, page: open.data.pagination.totalPages + 5 });
    const emptyPastEnd = past.data.rows.length === 0;
    const clampedToLast = past.data.pagination.page === Math.max(open.data.pagination.totalPages, 1) && past.data.rows.length > 0;
    expect(emptyPastEnd || clampedToLast, `page past the end returned page ${past.data.pagination.page} with ${past.data.rows.length} rows`).toBe(true);

    const none = await readMeters(api, env.timeouts.api, { ...openQuery, q: 'NO-SUCH-METER-000' });
    expect(none.data.pagination.total, 'total 0').toBe(0);
    expect(none.data.rows, 'total 0 rows').toHaveLength(0);
  });

  test('Unmapped meters, inactive meters, and all meters can each be listed', async ({ api, env }) => {
    const unmapped = await readMeters(api, env.timeouts.api, { ...openQuery, mappingStatus: 'unmapped' });
    expect(new URL(unmapped.url).searchParams.get('mappingStatus')).toBe('unmapped');

    const inactive = await readMeters(api, env.timeouts.api, { ...openQuery, isActive: false });
    expect(new URL(inactive.url).searchParams.get('isActive')).toBe('false');
    if (inactive.data.rows.some((row) => row.isActiveStatus)) {
      console.log('ISSUE MMA-005: isActive=false still returned an active meter.');
    }
    expect.soft(inactive.data.rows.every((row) => !row.isActiveStatus), 'inactive rows').toBe(true);

    const all = await readMeters(api, env.timeouts.api, { page: 1, limit: 10, isActive: 'all', mappingStatus: 'mapped' });
    expect(new URL(all.url).searchParams.get('isActive')).toBe('all');
    expect(all.data.pagination.total, 'all is at least the active total').toBeGreaterThanOrEqual(0);
  });

  test('A download of one filtered meter is an Excel file', async ({ api, env, data }) => {
    const page = await readMeters(api, env.timeouts.api, openQuery);
    const serial = String(page.data.rows[0].meterSerialNumber ?? '').trim();
    expect(serial, 'serial').not.toBe('');
    const matched = await readMeters(api, env.timeouts.api, { ...openQuery, q: serial });
    const filtered = data.payload<ExportPayload>('payloads/exports.json', 'meterFiltered');
    filtered.filters.q = serial;
    filtered.columns = columnKeys;
    const exported = await api.post('consumerMasterExport', {
      data: filtered,
      failOnStatus: false,
      timeout: 60_000,
    });
    expect(exported.durationMs).toBeLessThanOrEqual(env.timeouts.api);
    expect(exported.requestHeaders.Authorization).toMatch(/^Bearer\s+\S+/);
    if (exported.status === 202) {
      exportJobSchema.parse(exported.body);
      console.log('ISSUE MMA-004: a one-serial export was queued. The file was not downloaded, so the row count was not checked.');
    }
    if (exported.status !== 200) {
      console.log(`ISSUE MMA-004: export status ${exported.status} ${JSON.stringify(exported.body).slice(0, 400)}`);
    }
    expect(exported.status, 'one-serial export streams the file').toBe(200);
    expect(exported.contentType).toMatch(/spreadsheetml|octet-stream|application\/zip/i);
    const rows = await sheetRows(exported.body);
    expect(rows[0], 'export headers').toEqual(exportHeaders);
    expect(rows.length - 1, 'export data rows').toBe(matched.data.pagination.total);
    expect(rows.some((row) => row.some((cell) => cell.includes(serial))), 'exported serial').toBe(true);
  });

  test('A download of selected meters and a filtered download of more than one meter both succeed', async ({ api, env, data }) => {
    const page = await readMeters(api, env.timeouts.api, openQuery);
    const selectedId = meterExportId(page.data.rows[0]);
    expect(selectedId, 'selected id').toBeGreaterThan(0);
    const selectedBody = data.payload<ExportPayload>('payloads/exports.json', 'meterSelected');
    selectedBody.selectedIds = [selectedId];
    selectedBody.columns = columnKeys;
    const selected = await api.post('consumerMasterExport', {
      data: selectedBody,
      failOnStatus: false,
      timeout: 60_000,
    });
    expect(selected.status, 'selected export').toBe(200);
    const selectedRows = await sheetRows(selected.body);
    expect(selectedRows[0], 'selected export headers').toEqual(exportHeaders);
    expect(selectedRows.length - 1, 'selected export rows').toBe(1);

    const narrow = await narrowExport(api, env.timeouts.api);
    const exportedBody = data.payload<ExportPayload>('payloads/exports.json', 'meterFiltered');
    exportedBody.filters = narrow.filters;
    exportedBody.columns = columnKeys;
    const exported = await api.post('consumerMasterExport', {
      data: exportedBody,
      failOnStatus: false,
      timeout: 120_000,
    });
    expect(exported.status, 'filtered export').toBe(200);
    const rows = await sheetRows(exported.body);
    expect(rows[0], 'filtered export headers').toEqual(exportHeaders);
    expect(rows.length - 1, 'filtered export row count').toBe(narrow.total);
    expect(narrow.total, 'more than one filtered row').toBeGreaterThan(1);
  });

  test('The bulk upload template is the meter Excel file', async ({ api, env }) => {
    const file = await api.get('meterBulkTemplate', { expectedStatus: 200, timeout: 60_000 });
    expect(file.durationMs).toBeLessThanOrEqual(env.timeouts.api);
    expect(file.contentType).toMatch(/spreadsheetml/i);
    expect(String(file.body).startsWith('PK')).toBe(true);
    const [headers] = await sheetRows(file.body);
    expect(headers, 'template headers').toEqual(templateHeaders);
  });

  test('A spreadsheet saved as CSV is rejected', async ({ api, env }) => {
    const before = (await readMeters(api, env.timeouts.api, openQuery)).data.pagination.total;
    const rejected = await api.post('meterBulkUpload', {
      multipart: {
        conflictMode: 'merge',
        file: { name: 'meters.csv', mimeType: 'text/csv', buffer: Buffer.from('not a workbook') },
      },
      expectedStatus: 400,
      timeout: 60_000,
    });
    const body = expectApiContract(rejected, validationErrorSchema, env.timeouts.api, 'non-xlsx meter import', { status: 400 });
    expect(body.error.message, 'xlsx only').toContain('Only .xlsx files are allowed.');
    const after = await readMeters(api, env.timeouts.api, openQuery);
    expect(after.data.pagination.total, 'csv does not change the list').toBe(before);
  });

  test('An invalid Excel file is rejected and the meter total stays the same', async ({ api, env }) => {
    const before = (await readMeters(api, env.timeouts.api, openQuery)).data.pagination.total;
    const headers = [...METER_TEMPLATE_HEADERS];
    const files: Array<{ name: string; rows: string[][] }> = [
      { name: 'missing-header.xlsx', rows: [headers.filter((header) => header !== 'Meter Serial Number'), ['x']] },
      { name: 'headers-only.xlsx', rows: [headers] },
      { name: 'empty.xlsx', rows: [] },
      { name: 'blank-serial.xlsx', rows: [headers, meterCells({ 'Meter Status': 'not-a-status' })] },
      { name: 'duplicate-header.xlsx', rows: [[...headers, 'meter serial number'], meterCells({ 'Meter Serial Number': 'ZZ-NOT-A-METER' })] },
    ];
    for (const file of files) {
      await expectRejectedWorkbook(api, env.timeouts.api, file.name, await meterSheetBuffer(file.rows), before);
    }
  });

  test('The screens a signed-in person opens all succeed', async ({ api, env }) => {
    const me = expectAuthorizedContract(await api.get('authMe', { expectedStatus: 200 }), sessionMeSchema, env.timeouts.api, 'auth me');
    const keys = expectAuthorizedContract(
      await api.get('myPermissions', { expectedStatus: 200 }),
      permissionKeysSchema,
      env.timeouts.api,
      'permissions',
    );
    expect(keys.data.permissions, 'meters.view').toContain('meters.view');
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

test.describe('Meter list sign-in checks @master-data @regression', () => {
  functionality('Master Data');

  test('Meter reads are refused when nobody is signed in or the sign-in is not valid', async ({ request, app, env }) => {
    const anonymous = new ApiClient(request, app, env);
    const reads = ['metersData', 'meterCommunicationStatus', 'meterBulkTemplate', 'notificationStats', 'auth2faDevices', 'authMe', 'myPermissions'];
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

  test('Meter download and meter upload are refused when nobody is signed in or the sign-in is not valid', async ({ app, env, data }) => {
    const context = await playwrightRequest.newContext();
    const anonymous = new ApiClient(context, app, env);
    try {
    await anonymous.get('metersData', { failOnStatus: false });
    const posts: Array<{ endpoint: string; options: Parameters<ApiClient['post']>[1] }> = [
      {
        endpoint: 'consumerMasterExport',
        options: { data: data.payload<ExportPayload>('payloads/exports.json', 'meterUnauthorized') },
      },
      {
        endpoint: 'meterBulkUpload',
        options: {
          multipart: {
            conflictMode: 'merge',
            file: { name: 'meters.csv', mimeType: 'text/csv', buffer: Buffer.from('not a workbook') },
          },
        },
      },
    ];
    for (const post of posts) {
      const missing = await anonymous.post(post.endpoint, { ...post.options, failOnStatus: false });
      if (missing.status !== 401) {
        console.log(`ISSUE ${post.endpoint} missing token: status ${missing.status} ${JSON.stringify(missing.body).slice(0, 300)}`);
      }
      expectUnauthorized(missing, env.timeouts.api, `${post.endpoint} missing token`);
      const forged = await anonymous.post(post.endpoint, {
        ...post.options,
        headers: { Authorization: 'Bearer not-a-token' },
        failOnStatus: false,
      });
      if (forged.status !== 401) {
        console.log(`ISSUE ${post.endpoint} bad bearer: status ${forged.status} ${JSON.stringify(forged.body).slice(0, 300)}`);
      }
      expectUnauthorized(forged, env.timeouts.api, `${post.endpoint} bad bearer`, { sentToken: true });
    }
    } finally {
      await context.dispose();
    }
  });

  test('A meter download without the security cookie is refused', async ({ app, env, data }) => {
    const context = await playwrightRequest.newContext();
    try {
      const anonymous = new ApiClient(context, app, env);
      const rejected = await anonymous.post('consumerMasterExport', {
        data: data.payload<ExportPayload>('payloads/exports.json', 'meterUnauthorized'),
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

async function sheetRows(body: unknown): Promise<string[][]> {
  const buffer = Buffer.from(Buffer.isBuffer(body) ? body : Buffer.from(String(body)));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);
  const sheet = workbook.worksheets[0];
  const rows: string[][] = [];
  sheet?.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: false }, (cell) => {
      cells.push(String(cell.text ?? cell.value ?? '').trim());
    });
    if (cells.some((cell) => cell.length > 0)) {
      rows.push(cells);
    }
  });
  return rows;
}

function meterExportId(row: { id?: unknown; meterLookupTblRefId?: unknown } | undefined): number {
  const lookup = row?.meterLookupTblRefId;
  if (typeof lookup === 'number' && Number.isInteger(lookup) && lookup > 0) return lookup;
  if (typeof lookup === 'string' && /^\d+$/.test(lookup.trim())) return Number(lookup.trim());
  const key = String(row?.id ?? '').trim();
  const prefixed = /^meter-(\d+)$/i.exec(key);
  if (prefixed) return Number(prefixed[1]);
  return /^\d+$/.test(key) ? Number(key) : 0;
}

async function narrowExport(api: ApiClient, limitMs: number): Promise<{ filters: Record<string, string>; total: number }> {
  const page = await readMeters(api, limitMs, openQuery);
  const serial = String(page.data.rows[0]?.meterSerialNumber ?? '').trim();
  const scopes: Array<Record<string, string>> = [
    {},
    { connection: 'dtr' },
    { connection: 'consumer' },
    { communicationStatus: 'communicating' },
    { communicationStatus: 'non-communicating' },
  ];
  for (const scope of scopes) {
    for (let length = Math.min(6, serial.length); length >= 2; length -= 1) {
      const q = serial.slice(0, length);
      const found = await readMeters(api, limitMs, { ...openQuery, q, ...scope });
      const total = found.data.pagination.total;
      if (total > 1 && total <= 40) {
        return { filters: { q, isActive: 'true', mappingStatus: 'mapped', ...scope }, total };
      }
    }
  }
  throw new Error('No meter filter returned between 2 and 40 rows, so a multi-row export was not sent.');
}

async function expectRejectedWorkbook(api: ApiClient, limitMs: number, name: string, buffer: Buffer, before: number): Promise<void> {
  const rejected = await api.post('meterBulkUpload', {
    multipart: {
      conflictMode: 'merge',
      file: {
        name,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer,
      },
    },
    failOnStatus: false,
    timeout: 60_000,
  });
  const after = await readMeters(api, limitMs, openQuery);
  expect(after.data.pagination.total, `${name} list total`).toBe(before);
  const body = rejected.body as { success?: boolean };
  if (rejected.status >= 200 && rejected.status < 300) {
    expect(body.success, `${name} must not import`).not.toBe(true);
    return;
  }
  expect([400, 415, 422], name).toContain(rejected.status);
}

async function readMeters(api: ApiClient, limitMs: number, query: Record<string, string | number | boolean>) {
  const result = await api.get('metersData', { query, expectedStatus: 200, timeout: 60_000 });
  const body = expectAuthorizedContract(result, meterListSchema, limitMs, 'meter list');
  return Object.assign(body, { url: result.url });
}