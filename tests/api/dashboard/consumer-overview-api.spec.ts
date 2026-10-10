import { expect, functionality, test } from '../../../src/core/fixtures/test.fixtures';
import { ApiClient } from '../../../src/core/api/api.client';
import {
  consumerMetricsSchema,
  loginSchema,
  masterListSchema,
  meterStatusSchema,
  validationErrorSchema,
} from '../../../src/core/api/dashboard.schemas';
import {
  expectApiContract,
  expectAuthorizedContract,
  expectUnauthorized,
  kolkataMonthQuery,
  totalCount,
} from '../support/expect-dashboard-contract';

const month = kolkataMonthQuery();

test.describe('Consumer overview numbers from the server @dashboard @regression', () => {
  functionality('Dashboard');

  test.beforeEach(async ({ api, data, env }) => {
    const login = await api.authenticate(data.user('validAdmin'));
    expectApiContract(login, loginSchema, env.timeouts.api, 'login', { authorized: false, hasBody: true });
  });

  test('The consumer summary arrives on time, in the expected shape, and the totals follow the rules @smoke', async ({ api, env }) => {
    const result = await api.get('consumerMetrics', { query: { view: 'consumer' }, expectedStatus: 200 });
    const body = expectAuthorizedContract(result, consumerMetricsSchema, env.timeouts.api, 'consumer metrics');
    const dataNode = body.data;
    expect(totalCount(dataNode, 'consumer metrics'), 'total consumers').toBe(dataNode.consumerType.totalConsumers.count);
    const connected = dataNode.connectionStatus.cd.count + dataNode.connectionStatus.td.count + dataNode.connectionStatus.pd.count;
    expect(connected, 'relay slices').toBe(dataNode.connectionStatus.totalMeterCount);
    const types = dataNode.consumerType;
    expect(types.prepaid.count + types.postpaid.count, 'prepaid + postpaid').toBe(types.totalConsumers.count);
    expect(sumCounts(dataNode.oemWiseConsumer), 'OEM sum').toBe(sumCounts(dataNode.phaseWiseConsumer));
    expect(sumCounts(dataNode.categoryWiseConsumer), 'category sum').toBe(types.totalConsumers.count);
  });

  test('Meter status arrives on time, in the expected shape, and communicating meters are identified', async ({ api, env }) => {
    const result = await api.get('consumerMeterStatus', { query: month, expectedStatus: 200 });
    const body = expectAuthorizedContract(result, meterStatusSchema, env.timeouts.api, 'meter status');
    const dataNode = body.data;
    const total = totalCount(dataNode, 'meter status');
    const communicating = numberField(dataNode, 'communicatedConsumerMeters');
    const nonCommunicating = numberField(dataNode, 'nonCommunicatedConsumerMeters');
    expect(communicating + nonCommunicating, 'communicating + non-communicating').toBe(total);
    expect(numberField(dataNode, 'communicatedPercentage')).toBeGreaterThanOrEqual(0);
    expect(numberField(dataNode, 'nonCommunicatedPercentage')).toBeGreaterThanOrEqual(0);
  });

  test('The consumer list total matches the Consumers card', async ({ api, env }) => {
    const metrics = consumerMetricsSchema.parse(
      (await api.get('consumerMetrics', { query: { view: 'consumer' }, expectedStatus: 200 })).body,
    );
    const result = await api.get('consumerMasterData', { expectedStatus: 200 });
    const body = expectAuthorizedContract(result, masterListSchema, env.timeouts.api, 'consumer master data');
    expect(totalCount(body.data, 'consumer list')).toBe(metrics.data.consumerType.totalConsumers.count);
  });

  test('The category total matches the Residential row', async ({ api, env }) => {
    const metrics = consumerMetricsSchema.parse(
      (await api.get('consumerMetrics', { query: { view: 'consumer' }, expectedStatus: 200 })).body,
    );
    const residential = Object.values(metrics.data.categoryWiseConsumer).find((item) => /residential/i.test(item.label));
    expect(residential, 'Residential category').toBeDefined();
    const result = await api.get('consumerCategoryDistribution', {
      query: { category: 'Residential' },
      expectedStatus: 200,
    });
    const body = expectAuthorizedContract(result, masterListSchema, env.timeouts.api, 'category distribution');
    expect(totalCount(body.data, 'Residential')).toBe(residential?.count);
  });

  test('Connection, phase, category, and manufacturer lists match the chart pieces', async ({ api, env }) => {
    test.setTimeout(300_000);
    const metrics = consumerMetricsSchema.parse(
      (await api.get('consumerMetrics', { query: { view: 'consumer' }, expectedStatus: 200 })).body,
    );
    const connection = metrics.data.connectionStatus;
    await expectSlice(api, env.timeouts.api, 'connection', 'connected', connection.cd);
    await expectSlice(api, env.timeouts.api, 'connection', 'disconnected', connection.td);
    await expectSlice(api, env.timeouts.api, 'connection', 'permanently-disconnected', connection.pd);

    for (const phase of ['1 PH', '3 PH WC', '3 PH 4 CT', 'HT'] as const) {
      const slice = Object.values(metrics.data.phaseWiseConsumer).find((item) => phaseQuery(item.label) === phase);
      await expectSlice(api, env.timeouts.api, 'phase', phase, slice ?? { count: 0, label: phase });
    }

    for (const slice of Object.values(metrics.data.categoryWiseConsumer)) {
      await expectSlice(api, env.timeouts.api, 'category', slice.label, slice);
    }
    for (const slice of Object.values(metrics.data.oemWiseConsumer)) {
      await expectSlice(api, env.timeouts.api, 'oem', slice.label, slice);
    }
  });

  test('An unknown view, a date with only one end, and a list opened without its filter are rejected', async ({ api, env }) => {
    await expectValidation(api, env.timeouts.api, 'consumerMetrics', { view: 'bogus' });
    await expectValidation(api, env.timeouts.api, 'consumerMeterStatus', { fromDate: '2026-01-01' });
    await expectValidation(api, env.timeouts.api, 'consumerConnectionStatus', { status: 'bogus' });
    await expectValidation(api, env.timeouts.api, 'consumerCategoryDistribution', {});
    await expectValidation(api, env.timeouts.api, 'consumerPhaseDistribution', { phase: 'bogus' });
    await expectValidation(api, env.timeouts.api, 'consumerOemDistribution', {});
  });
});

test.describe('Consumer overview sign-in checks @dashboard @regression', () => {
  functionality('Dashboard');

  test('Every consumer overview read is refused when nobody is signed in or the sign-in is not valid', async ({ request, app, env }) => {
    const anonymous = new ApiClient(request, app, env);
    const reads: Array<{ endpoint: string; query?: Record<string, string> }> = [
      { endpoint: 'consumerMetrics', query: { view: 'consumer' } },
      { endpoint: 'consumerMeterStatus', query: month },
      { endpoint: 'consumerMasterData' },
      { endpoint: 'consumerCategoryDistribution', query: { category: 'Residential' } },
      { endpoint: 'consumerConnectionStatus', query: { status: 'connected' } },
      { endpoint: 'consumerPhaseDistribution', query: { phase: '1 PH' } },
      { endpoint: 'consumerOemDistribution', query: { oem: 'L&T' } },
    ];
    for (const read of reads) {
      const missing = await anonymous.get(read.endpoint, { query: read.query, expectedStatus: 401 });
      expectUnauthorized(missing, env.timeouts.api, `${read.endpoint} missing token`);
      const forged = await anonymous.get(read.endpoint, {
        query: read.query,
        headers: { Authorization: 'Bearer not-a-token' },
        expectedStatus: 401,
      });
      expectUnauthorized(forged, env.timeouts.api, `${read.endpoint} bad bearer`, { sentToken: true });
    }
  });
});

const drilldownEndpoint = {
  connection: 'consumerConnectionStatus',
  phase: 'consumerPhaseDistribution',
  category: 'consumerCategoryDistribution',
  oem: 'consumerOemDistribution',
} as const;

const drilldownQueryKey = {
  connection: 'status',
  phase: 'phase',
  category: 'category',
  oem: 'oem',
} as const;

async function expectSlice(
  api: ApiClient,
  limitMs: number,
  kind: keyof typeof drilldownEndpoint,
  value: string,
  slice: { count: number; label: string },
): Promise<void> {
  const result = await api.get(drilldownEndpoint[kind], {
    query: { [drilldownQueryKey[kind]]: value, limit: 1 },
    expectedStatus: 200,
  });
  const body = expectAuthorizedContract(result, masterListSchema, limitMs, `${kind} ${value}`);
  const total = totalCount(body.data, `${kind} ${value}`);
  console.log(`CO API ${kind} ${value}: drill-down ${total}; metrics ${slice.label} ${slice.count}`);
  if (total !== slice.count) {
    console.log(`ISSUE CO API: ${kind} ${value} drill-down is ${total}. The metrics slice is ${slice.count}.`);
  }
  expect.soft(total, `${kind} ${value} matches metrics`).toBe(slice.count);
}

async function expectValidation(
  api: ApiClient,
  limitMs: number,
  endpoint: string,
  query: Record<string, string>,
): Promise<void> {
  const result = await api.get(endpoint, { query, expectedStatus: 400 });
  expectApiContract(result, validationErrorSchema, limitMs, `invalid ${endpoint} ${JSON.stringify(query)}`, { status: 400 });
}

function phaseQuery(label: string): string | undefined {
  const compact = label.replace(/\s+/g, '').toUpperCase();
  if (compact === '1PH') return '1 PH';
  if (compact.includes('4CT')) return '3 PH 4 CT';
  if (compact.includes('WC')) return '3 PH WC';
  if (compact === 'HT') return 'HT';
  return undefined;
}

function sumCounts(record: Record<string, { count: number }>): number {
  return Object.values(record).reduce((sum, item) => sum + item.count, 0);
}

function numberField(record: object, field: string): number {
  const value = (record as Record<string, unknown>)[field];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.replace('%', '').replace(/,/g, '').trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  throw new Error(`Missing ${field}. Keys: ${Object.keys(record).join(', ')}`);
}
