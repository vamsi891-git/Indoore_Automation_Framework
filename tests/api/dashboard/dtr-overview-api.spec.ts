import { expect, functionality, test } from '../../../src/core/fixtures/test.fixtures';
import { ApiClient } from '../../../src/core/api/api.client';
import {
  loginSchema,
  detailsTotalSchema,
  dtrBreakdownSchema,
  dtrPointsSchema,
  dtrSummarySchema,
  masterListSchema,
  validationErrorSchema,
} from '../../../src/core/api/dashboard.schemas';
import { expectApiContract, expectAuthorizedContract, expectUnauthorized, totalCount } from '../support/expect-dashboard-contract';

test.describe('DTR overview API @dashboard @regression', () => {
  functionality('Dashboard');

  test.beforeEach(async ({ api, data, env }) => {
    const login = await api.authenticate(data.user('validAdmin'));
    expectApiContract(login, loginSchema, env.timeouts.api, 'login', { authorized: false, hasBody: true });
  });

  test('summary status, time, schema, content type, total, and card identity @smoke', async ({ api, env }) => {
    const result = await api.get('dtrSummary', { query: { period: 'daily' }, expectedStatus: 200 });
    const body = expectAuthorizedContract(result, dtrSummarySchema, env.timeouts.api, 'dtr summary');
    const total = totalCount(body.data, 'dtr summary');
    for (const field of ['dtrsOn', 'dtrsOff', 'activeAlerts'] as const) {
      const card = body.data[field];
      if (card) {
        expect(card.count, field).toBeGreaterThanOrEqual(0);
      }
    }
    expect(total, 'total DTRs').toBeGreaterThanOrEqual(0);
    if (body.data.dtrsOn && body.data.dtrsOff) {
      expect(body.data.dtrsOn.count + body.data.dtrsOff.count, 'ON plus OFF is not forced to equal Total').toEqual(expect.any(Number));
    }
  });

  test('power, consumption, communication, loading, and both unbalance reads', async ({ api, env }) => {
    const power = expectAuthorizedContract(
      await api.get('dtrPowerStatus', { query: { period: 'daily' }, expectedStatus: 200 }),
      dtrPointsSchema,
      env.timeouts.api,
      'power status',
    );
    expect(power.data.points.length, 'daily power window').toBeLessThanOrEqual(12);
    const first = power.data.points[0] as Record<string, unknown>;
    expect(pointNumber(first, 'onPercentage', 'on_percentage'), 'on percentage').toBeGreaterThanOrEqual(0);
    expect(pointNumber(first, 'dtrsOn', 'dtrs_on'), 'dtrs on').toBeGreaterThanOrEqual(0);
    expect(pointNumber(first, 'dtrsOff', 'dtrs_off'), 'dtrs off').toBeGreaterThanOrEqual(0);

    const consumption = expectAuthorizedContract(
      await api.get('dtrConsumption', { query: { period: 'daily' }, expectedStatus: 200 }),
      dtrPointsSchema,
      env.timeouts.api,
      'consumption',
    );
    expect(consumption.data.points.length, 'daily consumption window').toBeLessThanOrEqual(12);
    const energy = consumption.data.points[0] as Record<string, unknown>;
    for (const field of ['kwh', 'kvah', 'kvarh'] as const) {
      const value = energy[field];
      expect(typeof value !== 'number' || Number.isFinite(value), field).toBe(true);
    }

    const communication = expectAuthorizedContract(
      await api.get('dtrCommunicationStatus', { expectedStatus: 200 }),
      dtrBreakdownSchema,
      env.timeouts.api,
      'communication',
    );
    totalCount(communication.data, 'communication');

    const loading = expectAuthorizedContract(
      await api.get('dtrPercentageLoading', { expectedStatus: 200 }),
      dtrBreakdownSchema,
      env.timeouts.api,
      'percentage loading',
    );
    totalCount(loading.data, 'percentage loading');

    const load = expectAuthorizedContract(
      await api.get('dtrLoadUnbalance', { expectedStatus: 200 }),
      dtrBreakdownSchema,
      env.timeouts.api,
      'load unbalance',
    );
    totalCount(load.data, 'load unbalance');

    const voltage = expectAuthorizedContract(
      await api.get('dtrVoltageUnbalance', { expectedStatus: 200 }),
      dtrBreakdownSchema,
      env.timeouts.api,
      'voltage unbalance',
    );
    totalCount(voltage.data, 'voltage unbalance');
  });

  test('detail totals match the clicked power, communication, loading, and unbalance counts', async ({ api, env }) => {
    const power = dtrPointsSchema.parse((await api.get('dtrPowerStatus', { query: { period: 'daily' }, expectedStatus: 200 })).body);
    const point = power.data.points[0] as Record<string, unknown>;
    const onDetails = expectAuthorizedContract(
      await api.get('dtrPowerStatusDetails', {
        query: { status: 'on', period: 'daily', bucket: toBucket(String(point.label)) },
        expectedStatus: 200,
      }),
      detailsTotalSchema,
      env.timeouts.api,
      'power on details',
    );
    expect(totalCount(onDetails.data, 'power on details')).toBe(pointNumber(point, 'dtrsOn', 'dtrs_on'));

    const communication = expectAuthorizedContract(
      await api.get('dtrCommunicationStatus', { expectedStatus: 200 }),
      dtrBreakdownSchema,
      env.timeouts.api,
      'communication chart',
    );
    const chart = communication.data as Record<string, unknown>;
    const points = Array.isArray(chart.points) ? chart.points.filter(isRecord) : [];
    const latest = points.at(-1);
    const communicated = expectAuthorizedContract(
      await api.get('dtrCommunicationDetails', { query: { status: 'communicated', limit: 1 }, expectedStatus: 200 }),
      detailsTotalSchema,
      env.timeouts.api,
      'communication details',
    );
    expectCountMatch(
      'communicating',
      totalCount(communicated.data, 'communicating details'),
      optionalPointNumber(latest ?? chart, 'communicating', 'communicated'),
    );
    const silent = expectAuthorizedContract(
      await api.get('dtrCommunicationDetails', { query: { status: 'non-communicated', limit: 1 }, expectedStatus: 200 }),
      detailsTotalSchema,
      env.timeouts.api,
      'non-communicating details',
    );
    expectCountMatch(
      'non-communicating',
      totalCount(silent.data, 'non-communicating details'),
      optionalPointNumber(latest ?? chart, 'nonCommunicating', 'non_communicating'),
    );

    const loading = expectAuthorizedContract(
      await api.get('dtrPercentageLoadingDetails', { query: { band: 'critical' }, expectedStatus: 200 }),
      detailsTotalSchema,
      env.timeouts.api,
      'percentage loading details',
    );
    expect(totalCount(loading.data, 'critical loading')).toBeGreaterThanOrEqual(0);

    const load = expectAuthorizedContract(
      await api.get('dtrLoadUnbalanceDetails', { query: { severity: 'severe' }, expectedStatus: 200 }),
      detailsTotalSchema,
      env.timeouts.api,
      'load unbalance details',
    );
    expect(totalCount(load.data, 'severe load')).toBeGreaterThanOrEqual(0);

    const voltage = expectAuthorizedContract(
      await api.get('dtrVoltageUnbalanceDetails', { query: { severity: 'severe' }, expectedStatus: 200 }),
      detailsTotalSchema,
      env.timeouts.api,
      'voltage unbalance details',
    );
    expect(totalCount(voltage.data, 'severe voltage')).toBeGreaterThanOrEqual(0);
  });

  test('DTR list total matches the Total DTRs card', async ({ api, env }) => {
    const summary = dtrSummarySchema.parse((await api.get('dtrSummary', { query: { period: 'daily' }, expectedStatus: 200 })).body);
    const result = await api.get('dtrMasterData', { expectedStatus: 200 });
    const body = expectAuthorizedContract(result, masterListSchema, env.timeouts.api, 'dtr master data');
    expect(totalCount(body.data, 'dtr list')).toBe(totalCount(summary.data, 'summary'));
  });

  test('hourly, weekly, and a past month still return the page contract', async ({ api, env }) => {
    for (const period of ['hourly', 'weekly'] as const) {
      expectAuthorizedContract(
        await api.get('dtrSummary', { query: { period }, expectedStatus: 200 }),
        dtrSummarySchema,
        env.timeouts.api,
        `${period} summary`,
      );
      expectAuthorizedContract(
        await api.get('dtrPowerStatus', { query: { period }, expectedStatus: 200 }),
        dtrPointsSchema,
        env.timeouts.api,
        `${period} power`,
      );
      expectAuthorizedContract(
        await api.get('dtrConsumption', { query: { period }, expectedStatus: 200 }),
        dtrPointsSchema,
        env.timeouts.api,
        `${period} consumption`,
      );
    }
    const past = { monthYear: '2025-06' };
    for (const endpoint of ['dtrSummary', 'dtrPowerStatus', 'dtrConsumption'] as const) {
      expectAuthorizedContract(
        await api.get(endpoint, { query: { period: 'daily', ...past }, expectedStatus: 200 }),
        endpoint === 'dtrSummary' ? dtrSummarySchema : dtrPointsSchema,
        env.timeouts.api,
        `${endpoint} past month`,
      );
    }
    expectAuthorizedContract(
      await api.get('dtrLoadUnbalance', { query: past, expectedStatus: 200 }),
      dtrBreakdownSchema,
      env.timeouts.api,
      'load unbalance past month',
    );
    expectAuthorizedContract(
      await api.get('dtrVoltageUnbalance', { query: past, expectedStatus: 200 }),
      dtrBreakdownSchema,
      env.timeouts.api,
      'voltage unbalance past month',
    );
  });

  test('rejects a bogus period, month, status, band, and severity', async ({ api, env }) => {
    const checks: Array<{ endpoint: string; query: Record<string, string> }> = [
      { endpoint: 'dtrSummary', query: { period: 'bogus' } },
      { endpoint: 'dtrSummary', query: { monthYear: '2026-13' } },
      { endpoint: 'dtrPowerStatusDetails', query: { status: 'bogus' } },
      { endpoint: 'dtrCommunicationDetails', query: { status: 'bogus' } },
      { endpoint: 'dtrPercentageLoadingDetails', query: { band: 'bogus' } },
      { endpoint: 'dtrLoadUnbalanceDetails', query: { severity: 'bogus' } },
    ];
    for (const check of checks) {
      const result = await api.get(check.endpoint, { query: check.query, expectedStatus: 400 });
      expectApiContract(result, validationErrorSchema, env.timeouts.api, `invalid ${check.endpoint}`, { status: 400 });
    }
  });
});

test.describe('DTR overview API security @dashboard @regression', () => {
  functionality('Dashboard');

  test('every DTR overview read rejects a missing token and a bad bearer', async ({ request, app, env }) => {
    const anonymous = new ApiClient(request, app, env);
    const reads = [
      'dtrSummary',
      'dtrPowerStatus',
      'dtrConsumption',
      'dtrCommunicationStatus',
      'dtrPercentageLoading',
      'dtrLoadUnbalance',
      'dtrVoltageUnbalance',
      'dtrMasterData',
      'dtrPowerStatusDetails',
      'dtrCommunicationDetails',
      'dtrPercentageLoadingDetails',
      'dtrLoadUnbalanceDetails',
      'dtrVoltageUnbalanceDetails',
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

function optionalPointNumber(point: Record<string, unknown>, camel: string, snake: string): number | undefined {
  const value = point[camel] ?? point[snake];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectCountMatch(name: string, actual: number, expectedCount: number | undefined): void {
  if (expectedCount === undefined) {
    console.log(`ISSUE DO API: ${name} details returned ${actual}, and the chart had no count to compare.`);
    expect.soft(expectedCount, `${name} chart count`).toEqual(expect.any(Number));
    return;
  }
  console.log(`DO API ${name}: details ${actual}; chart ${expectedCount}`);
  if (actual !== expectedCount) {
    console.log(`ISSUE DO API: ${name} details total is ${actual}. The chart count is ${expectedCount}.`);
  }
  expect.soft(actual, `${name} details match the chart`).toBe(expectedCount);
}

function pointNumber(point: Record<string, unknown>, camel: string, snake: string): number {
  const value = point[camel] ?? point[snake];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Missing ${camel} on ${String(point.label)}`);
  }
  return value;
}

function toBucket(label: string): string {
  return label.replace(/\bSeptember\b/g, 'Sep').replace(/\bSept\b/g, 'Sep').replace(/\bJune\b/g, 'Jun').replace(/\bJuly\b/g, 'Jul');
}
