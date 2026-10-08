import ExcelJS from 'exceljs';
import { expect, functionality, test } from '../../../src/core/fixtures/test.fixtures';
import { meterListSchema } from '../../../src/core/api/dashboard.schemas';
import { MeterMasterDataPage } from '../../../src/pages/meter-master-data.page';

const openQuery = { page: 1, limit: 10, isActive: true, mappingStatus: 'mapped' };

test.describe('Meter Data UI against the API @master-data @regression', () => {
  functionality('Master Data');
  test.describe.configure({ timeout: 240_000 });

  test('the footer matches data.total for the open list and each filter @smoke', async ({ loginPage, api, data, page, app, env }) => {
    await api.authenticate(data.user('validAdmin'));
    await loginPage.open();
    await loginPage.signIn(data.user('validAdmin'));
    await page.waitForURL(/\/consumers(?:\?|$)/, { timeout: 20_000 });
    const meters = new MeterMasterDataPage(page, app);
    const open = await meters.open();
    const apiOpen = await api.getParsed('metersData', meterListSchema, { query: openQuery, timeout: env.timeouts.api });
    expect(openQueryMatches(open.url), open.url).toBe(true);
    expect(open.total, 'unfiltered footer').toBe(apiOpen.data.pagination.total);
    await meters.expectFooter(open);

    const dtr = await meters.applyConnection('DTR');
    const apiDtr = await api.getParsed('metersData', meterListSchema, { query: { ...openQuery, connection: 'dtr' }, timeout: env.timeouts.api });
    expect(new URL(dtr.url).searchParams.get('connection')).toBe('dtr');
    expect(dtr.total).toBe(apiDtr.data.pagination.total);
    await meters.resetFilters();

    const consumer = await meters.applyConnection('Consumer');
    const apiConsumer = await api.getParsed('metersData', meterListSchema, {
      query: { ...openQuery, connection: 'consumer' },
      timeout: env.timeouts.api,
    });
    expect(consumer.total).toBe(apiConsumer.data.pagination.total);
    await meters.resetFilters();

    const online = await meters.applyCommunication('Online');
    const apiOnline = await api.getParsed('metersData', meterListSchema, {
      query: { ...openQuery, communicationStatus: 'communicating' },
      timeout: env.timeouts.api,
    });
    expect(new URL(online.url).searchParams.get('communicationStatus')).toBe('communicating');
    expect(new URL(online.url).searchParams.has('connection')).toBe(false);
    expect(online.total).toBe(apiOnline.data.pagination.total);
    await meters.resetFilters();

    const offline = await meters.applyCommunication('Offline');
    const apiOffline = await api.getParsed('metersData', meterListSchema, {
      query: { ...openQuery, communicationStatus: 'non-communicating' },
      timeout: env.timeouts.api,
    });
    expect(offline.total).toBe(apiOffline.data.pagination.total);
  });

  test('a filtered download has one workbook row per filtered meter', async ({ loginPage, api, data, page, app, env }) => {
    await api.authenticate(data.user('validAdmin'));
    await loginPage.open();
    await loginPage.signIn(data.user('validAdmin'));
    await page.waitForURL(/\/consumers(?:\?|$)/, { timeout: 20_000 });
    const meters = new MeterMasterDataPage(page, app);
    const open = await meters.open();
    const serial = meters.serialFrom(open);
    const found = await meters.searchFor(serial);
    const apiFound = await api.getParsed('metersData', meterListSchema, { query: { ...openQuery, q: serial }, timeout: env.timeouts.api });
    expect(found.total).toBe(apiFound.data.pagination.total);
    const downloaded = await meters.downloadFiltered();
    expect(downloaded.payload).toMatchObject({
      resource: 'meter',
      mode: 'filtered',
      filters: { q: serial, isActive: 'true', mappingStatus: 'mapped' },
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(downloaded.bytes as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);
    let rows = 0;
    workbook.worksheets[0]?.eachRow({ includeEmpty: false }, () => {
      rows += 1;
    });
    expect(rows - 1, 'workbook data rows').toBe(found.total);
  });
});

function openQueryMatches(url: string): boolean {
  const params = new URL(url).searchParams;
  return (
    params.get('page') === '1' &&
    params.get('limit') === '10' &&
    params.get('isActive') === 'true' &&
    params.get('mappingStatus') === 'mapped' &&
    !params.has('q') &&
    !params.has('connection') &&
    !params.has('communicationStatus')
  );
}
