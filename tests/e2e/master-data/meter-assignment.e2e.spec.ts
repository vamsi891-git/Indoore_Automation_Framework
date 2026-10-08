import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, functionality, test } from '../../../src/core/fixtures/test.fixtures';
import { ApiClient } from '../../../src/core/api/api.client';
import { lookupListSchema, meterListSchema } from '../../../src/core/api/dashboard.schemas';
import { MeterAssignmentPage } from '../../../src/pages/meter-assignment.page';
import { MeterMasterDataPage } from '../../../src/pages/meter-master-data.page';
import { METER_TEMPLATE_HEADERS, meterCells, writeMeterSheet } from '../../support/meter-workbook';

test.describe('Meter assignment @master-data @regression', () => {
  functionality('Master Data');
  test.describe.configure({ timeout: 600_000 });

  test('a bulk-uploaded meter can be assigned to a consumer and then cannot be assigned to a DTR', async ({
    loginPage,
    api,
    data,
    page,
    app,
    env,
  }) => {
    await api.authenticate(data.user('validAdmin'));
    await loginPage.open();
    await loginPage.signIn(data.user('validAdmin'));
    await page.waitForURL(/\/consumers(?:\?|$)/, { timeout: 20_000 });
    const identity = stamp('C');
    const meters = new MeterMasterDataPage(page, app);
    await meters.open();
    await meters.submitNewMeter(await meterFile(identity.serial, await manufacturerName(api, env.timeouts.api)));
    await expectMeterExists(api, env.timeouts.api, identity.serial);

    const assignment = new MeterAssignmentPage(page, app);
    await assignment.assignMeterToConsumer(identity);
    const linked = await expectMeterExists(api, env.timeouts.api, identity.serial, 'consumer');
    expect(String(linked.connection ?? '').toLowerCase()).toBe('consumer');
    await assignment.expectDtrRejectsConsumerMeter(identity.serial);
  });

  test('a bulk-uploaded meter assigned to a DTR cannot be assigned to a consumer', async ({
    loginPage,
    api,
    data,
    page,
    app,
    env,
  }) => {
    await api.authenticate(data.user('validAdmin'));
    await loginPage.open();
    await loginPage.signIn(data.user('validAdmin'));
    await page.waitForURL(/\/consumers(?:\?|$)/, { timeout: 20_000 });
    const identity = stamp('D');
    const meters = new MeterMasterDataPage(page, app);
    await meters.open();
    await meters.submitNewMeter(await meterFile(identity.serial, await manufacturerName(api, env.timeouts.api)));
    await expectMeterExists(api, env.timeouts.api, identity.serial);

    const assignment = new MeterAssignmentPage(page, app);
    await assignment.assignMeterToDtr(identity);
    const linked = await expectMeterExists(api, env.timeouts.api, identity.serial, 'dtr');
    expect(String(linked.connection ?? '').toLowerCase()).toBe('dtr');
    await assignment.expectConsumerRejectsDtrMeter(identity.serial);
  });
});

function stamp(kind: 'C' | 'D'): { serial: string; consumerId: string; dtrCode: string } {
  const tail = Date.now().toString().slice(-8);
  return {
    serial: `E2E${kind}${tail}`,
    consumerId: `E2E${kind}${tail}01`,
    dtrCode: `E2E${kind}${tail}`,
  };
}

async function manufacturerName(api: ApiClient, timeout: number): Promise<string> {
  const body = await api.getParsed('utilsDeviceManufacturers', lookupListSchema, { timeout });
  const name = body.data.items[0]?.name?.trim();
  expect(name, 'a meter manufacturer exists').toBeTruthy();
  return name;
}

async function meterFile(serial: string, manufacturer: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'meter-assign-'));
  const file = path.join(dir, `${serial}.xlsx`);
  await writeMeterSheet(file, [
    [...METER_TEMPLATE_HEADERS],
    meterCells({
      'Meter Serial Number': serial,
      'Meter Manufacturer': manufacturer,
      MF: '1',
      'Accuracy Class': '1.0',
      'Meter PO Number': `PO${serial.slice(-6)}`,
      'Meter PO Date': '2024-01-01',
      'Meter Testing Date': '2024-01-02',
      'Meter Status': 'Active',
    }),
  ]);
  return file;
}

async function expectMeterExists(
  api: ApiClient,
  timeout: number,
  serial: string,
  connection?: 'consumer' | 'dtr',
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 60_000;
  let last = 0;
  while (Date.now() < deadline) {
    const body = await api.getParsed('metersData', meterListSchema, {
      query: {
        page: 1,
        limit: 10,
        q: serial,
        isActive: true,
        ...(connection ? { connection } : {}),
      },
      timeout,
    });
    last = body.data.pagination.total;
    const row = body.data.rows.find((item) => String(item.meterSerialNumber ?? '') === serial);
    if (row && (!connection || String(row.connection ?? '').toLowerCase() === connection)) {
      return row;
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error(`Meter ${serial} was not listed${connection ? ` as ${connection}` : ''} (last total ${last})`);
}
