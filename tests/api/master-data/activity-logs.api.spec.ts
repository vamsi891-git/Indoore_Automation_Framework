import { request as playwrightRequest } from '@playwright/test';
import { expect, functionality, test } from '../../../src/core/fixtures/test.fixtures';
import { ApiClient } from '../../../src/core/api/api.client';
import { auditLogListSchema, rolesListSchema, validationErrorSchema } from '../../../src/core/api/dashboard.schemas';
import { expectApiContract, expectAuthorizedContract, expectUnauthorized } from '../support/expect-dashboard-contract';
import type { EnvironmentConfig } from '../../../src/core/config/config.loader';

const ACTIONS: { label: string; code: string }[] = [
  { label: 'Consumer Created', code: 'consumer.created' },
  { label: 'Consumer Updated', code: 'consumer.updated' },
  { label: 'Consumer Deleted', code: 'consumer.deleted' },
  { label: 'Consumer Bulk Created', code: 'consumer.bulk_created' },
  { label: 'Consumer Activation Change', code: 'consumer.activation_change' },
  { label: 'DTR Created', code: 'dtr.created' },
  { label: 'DTR Updated', code: 'dtr.updated' },
  { label: 'DTR Deleted', code: 'dtr.deleted' },
  { label: 'DTR Bulk Created', code: 'dtr.bulk_created' },
  { label: 'Meter Created', code: 'meter.created' },
  { label: 'Meter Updated', code: 'meter.updated' },
  { label: 'Meter Deleted', code: 'meter.deleted' },
  { label: 'Meters Bulk Created', code: 'meter.bulk_created' },
  { label: 'Upload Validated', code: 'master_data.upload.validated' },
  { label: 'Upload Approved', code: 'master_data.upload.approved' },
  { label: 'Upload Rejected', code: 'master_data.upload.rejected' },
];

test.describe('Activity logs API @master-data @regression', () => {
  functionality('Master Data');

  test.beforeEach(async ({ api, data }) => {
    await api.authenticate(data.user('validAdmin'));
  });

  test('ALD-001 today returns a paged contract @smoke', async ({ api, env }) => {
    const today = indiaToday();
    const body = expectAuthorizedContract(
      await api.get('masterDataAuditLogs', { query: todayQuery(today) }),
      auditLogListSchema,
      env.timeouts.api,
      'activity logs today',
    );
    expect(body.data.page).toBe(1);
    expect(body.data.limit).toBe(20);
    expect(body.data.totalPages).toBe(body.data.total === 0 ? 0 : Math.ceil(body.data.total / body.data.limit));
    expect(body.data.logs.length).toBeLessThanOrEqual(body.data.limit);
    expect(body.data.columns.map((column) => column.header)).toEqual(['Time', 'User', 'Role', 'Action', 'Details', 'IP']);
    expect(body.data.columns.every((column) => column.key.trim() !== '')).toBe(true);
    expect(body.data.actionFilterOptions.map((option) => option.value)).toEqual(ACTIONS.map((action) => action.code));
    expect(body.data.actionFilterOptions.every((option) => option.label.trim() !== '')).toBe(true);
    assertRows(body.data.logs);
  });

  test('ALD-002 search is trimmed and a miss is an empty success', async ({ api, env }) => {
    const today = indiaToday();
    const open = expectAuthorizedContract(
      await api.get('masterDataAuditLogs', { query: todayQuery(today) }),
      auditLogListSchema,
      env.timeouts.api,
      'activity logs before search',
    );
    const needle = String(open.data.logs[0]?.action ?? '').trim();
    if (needle) {
      const found = expectAuthorizedContract(
        await api.get('masterDataAuditLogs', { query: { ...todayQuery(today), search: `  ${needle}  ` } }),
        auditLogListSchema,
        env.timeouts.api,
        'activity logs search',
      );
      expect(found.data.page).toBe(1);
      expect(found.data.total).toBeGreaterThan(0);
      for (const row of found.data.logs) {
        const visible = ['User', 'Role', 'Action', 'Details', 'IP', 'actorLabel', 'roleLabel', 'actionLabel', 'ipAddress']
          .map((key) => JSON.stringify(row[key] ?? ''))
          .join(' ');
        expect.soft(visible.toLowerCase().includes(needle.toLowerCase()), `ISSUE ALD-001 row ${String(row.id)} does not show ${needle}`).toBe(true);
      }
    }
    const miss = expectAuthorizedContract(
      await api.get('masterDataAuditLogs', { query: { ...todayQuery(today), search: 'NO-SUCH-ACTIVITY-LOG-000' } }),
      auditLogListSchema,
      env.timeouts.api,
      'activity logs search miss',
    );
    expect(miss.data.total).toBe(0);
    expect(miss.data.logs).toEqual([]);
    expect(miss.data.totalPages).toBe(0);
  });

  test('ALD-003 roles are names and a role filter keeps that role', async ({ api, env }) => {
    const roles = expectAuthorizedContract(
      await api.get('permissionRoles'),
      rolesListSchema,
      env.timeouts.api,
      'permission roles',
    );
    const names = roles.data.roles.map((role) => role.name);
    expect(names.every((name) => name.trim() !== '')).toBe(true);
    expect(new Set(names).size).toBe(names.length);
    const role = names.find((name) => name.trim()) ?? '';
    expect(role, 'a role name').not.toBe('');
    const today = indiaToday();
    const filtered = expectAuthorizedContract(
      await api.get('masterDataAuditLogs', { query: { ...todayQuery(today, { limit: 50 }), role } }),
      auditLogListSchema,
      env.timeouts.api,
      'activity logs by role',
    );
    for (const row of filtered.data.logs) {
      expect(String(row.Role ?? row.roleLabel ?? ''), `role on ${String(row.id)}`).toBe(role);
    }
  });

  test('ALD-004 every known action filter returns only that action', async ({ api, env }) => {
    const today = indiaToday();
    const cleared = expectAuthorizedContract(
      await api.get('masterDataAuditLogs', { query: { page: 1, limit: 20 } }),
      auditLogListSchema,
      env.timeouts.api,
      'activity logs without dates',
    );
    const todayBody = expectAuthorizedContract(
      await api.get('masterDataAuditLogs', { query: todayQuery(today) }),
      auditLogListSchema,
      env.timeouts.api,
      'activity logs today total',
    );
    expect(cleared.data.total).toBeGreaterThanOrEqual(todayBody.data.total);
    for (const action of ACTIONS) {
      const body = expectAuthorizedContract(
        await api.get('masterDataAuditLogs', { query: { page: 1, limit: 10, action: action.code } }),
        auditLogListSchema,
        env.timeouts.api,
        action.code,
      );
      for (const row of body.data.logs) {
        expect(row.action, action.code).toBe(action.code);
        const shown = String(row.Action ?? row.actionLabel ?? '');
        expect.soft(shown === action.code || shown === action.label, `ISSUE: ${action.code} shows "${shown}" instead of "${action.label}"`).toBe(true);
      }
    }
  });

  test('ALD-005 from and to use the India day and reject an inverted range', async ({ api, env }) => {
    const today = indiaToday();
    const body = expectAuthorizedContract(
      await api.get('masterDataAuditLogs', {
        query: {
          page: 1,
          limit: 20,
          from: `${today}T00:00:00+05:30`,
          to: `${today}T23:59:59.999+05:30`,
        },
      }),
      auditLogListSchema,
      env.timeouts.api,
      'inclusive India day',
    );
    expect(body.data.page).toBe(1);
    const inverted = await api.get('masterDataAuditLogs', {
      query: {
        page: 1,
        limit: 20,
        from: `${today}T23:59:59.999+05:30`,
        to: `${today}T00:00:00+05:30`,
      },
      failOnStatus: false,
    });
    expectApiContract(inverted, validationErrorSchema, env.timeouts.api, 'inverted activity range', { status: 400 });
  });

  test('ALD-007 page 2 does not repeat page 1 and the size is the requested size', async ({ api, env }) => {
    const wide = expectAuthorizedContract(
      await api.get('masterDataAuditLogs', { query: { page: 1, limit: 10 } }),
      auditLogListSchema,
      env.timeouts.api,
      'activity logs page 1 size 10',
    );
    expect(wide.data.limit).toBe(10);
    expect(wide.data.totalPages).toBe(wide.data.total === 0 ? 0 : Math.ceil(wide.data.total / 10));
    if (wide.data.total > 10) {
      const second = expectAuthorizedContract(
        await api.get('masterDataAuditLogs', { query: { page: 2, limit: 10 } }),
        auditLogListSchema,
        env.timeouts.api,
        'activity logs page 2',
      );
      expect(second.data.page).toBe(2);
      const firstIds = new Set(wide.data.logs.map((row) => String(row.id)));
      for (const row of second.data.logs) {
        expect(firstIds.has(String(row.id)), `page 2 repeats ${String(row.id)}`).toBe(false);
      }
    }
    const sized = expectAuthorizedContract(
      await api.get('masterDataAuditLogs', { query: { page: 1, limit: 50 } }),
      auditLogListSchema,
      env.timeouts.api,
      'activity logs size 50',
    );
    expect(sized.data.limit).toBe(50);
    expect(sized.data.logs.length).toBeLessThanOrEqual(50);
  });

  test('ALD-008 a missing token is unauthorized', async ({ app, env }) => {
    const anonymous = new ApiClient(await playwrightRequest.newContext(), app, env);
    expectUnauthorized(await anonymous.get('masterDataAuditLogs', { query: { page: 1, limit: 20 }, failOnStatus: false }), env.timeouts.api, 'activity logs without a token');
  });

  test('ALD-009 rejected queries stay validation errors', async ({ api, env }) => {
    const cases: { label: string; query: Record<string, string | number> }[] = [
      { label: 'unknown action', query: { page: 1, limit: 20, action: 'meter.command' } },
      { label: 'action and prefix', query: { page: 1, limit: 20, action: 'meter.created', actionPrefix: 'meter.' } },
      { label: 'limit above 100', query: { page: 1, limit: 101 } },
      { label: 'limit zero', query: { page: 1, limit: 0 } },
      { label: 'search longer than 200', query: { page: 1, limit: 20, search: 'x'.repeat(201) } },
      { label: 'unknown sort', query: { page: 1, limit: 20, sort: 'user' } },
      { label: 'unknown query key', query: { page: 1, limit: 20, q: 'meter' } },
    ];
    for (const item of cases) {
      const result = await api.get('masterDataAuditLogs', { query: item.query, failOnStatus: false });
      expectApiContract(result, validationErrorSchema, env.timeouts.api, item.label, { status: 400 });
    }
  });

  test('ALD-006 a stored row is readable and does not carry a secret', async ({ api, env }) => {
    const body = expectAuthorizedContract(
      await api.get('masterDataAuditLogs', { query: { page: 1, limit: 50 } }),
      auditLogListSchema,
      env.timeouts.api,
      'activity logs for row content',
    );
    const seen = new Set(body.data.logs.map((row) => String(row.action)));
    expect(body.data.logs.length === 0 || seen.size > 0).toBe(true);
    assertRows(body.data.logs);
  });

  test('ALD-001 an omitted query defaults to page 1 and limit 20', async ({ api, env }) => {
    const body = await listed(api, env, {}, 'activity logs defaults');
    expect(body.data.page).toBe(1);
    expect(body.data.limit).toBe(20);
    expect(body.data.totalPages).toBe(body.data.total === 0 ? 0 : Math.ceil(body.data.total / 20));
    expect(body.data.logs.length).toBeLessThanOrEqual(20);
    expect(body.data.nextCursor === null || typeof body.data.nextCursor === 'string').toBe(true);
    const explicit = await listed(api, env, { page: 1, limit: 20, sort: 'createdAt_desc' }, 'activity logs explicit default sort');
    expect(explicit.data.logs.map((row) => String(row.id))).toEqual(body.data.logs.map((row) => String(row.id)));
  });

  test('ALD-002 a blank search matches the unfiltered list', async ({ api, env }) => {
    const today = indiaToday();
    const open = await listed(api, env, todayQuery(today), 'activity logs before blank search');
    const spaces = await listed(api, env, { ...todayQuery(today), search: '   ' }, 'activity logs spaces search');
    expect(spaces.data.total).toBe(open.data.total);
    expect(spaces.data.logs.map((row) => String(row.id))).toEqual(open.data.logs.map((row) => String(row.id)));
    const longSearch = await listed(api, env, { ...todayQuery(today), search: 'x'.repeat(200) }, 'activity logs search of 200');
    expect(longSearch.data.total).toBe(0);
    expect(longSearch.data.logs).toEqual([]);
  });

  test('ALD-003 a role id is not a role name and combined filters stay together', async ({ api, env }) => {
    const roles = expectAuthorizedContract(await api.get('permissionRoles'), rolesListSchema, env.timeouts.api, 'roles for the id check');
    const named = roles.data.roles.find((role) => role.name.trim() !== '');
    expect(named, 'a role name').toBeTruthy();
    const role = named!.name;
    const open = await listed(api, env, { page: 1, limit: 20 }, 'activity logs before role edges');
    const spaced = await listed(api, env, { page: 1, limit: 20, role: '   ' }, 'activity logs blank role');
    expect(spaced.data.total).toBe(open.data.total);
    const cased = role === role.toUpperCase() ? role.toLowerCase() : role.toUpperCase();
    const byCase = await listed(api, env, { page: 1, limit: 20, role: cased }, 'activity logs role case');
    const byName = await listed(api, env, { page: 1, limit: 20, role }, 'activity logs role name');
    expect(byCase.data.total).toBe(byName.data.total);
    for (const row of byCase.data.logs) {
      expect(String(row.Role ?? ''), `stored role for ${String(row.id)}`).toBe(role);
    }
    const idValue = (named as unknown as { id?: unknown }).id;
    const id = typeof idValue === 'string' ? idValue : '';
    if (id && id !== role) {
      const byId = await listed(api, env, { page: 1, limit: 20, role: id }, 'activity logs role id');
      for (const row of byId.data.logs) {
        expect(String(row.Role ?? ''), `role id must not resolve to ${role}`).toBe(id);
      }
    }
    const sample = open.data.logs.find((row) => ACTIONS.some((action) => action.code === row.action) && String(row.Role ?? '').trim());
    if (sample) {
      const action = String(sample.action);
      const combined = await listed(
        api,
        env,
        { page: 1, limit: 20, role: String(sample.Role), action, search: `  ${action}  ` },
        'activity logs role action and search',
      );
      expect(combined.data.page).toBe(1);
      for (const row of combined.data.logs) {
        expect(row.action).toBe(action);
        expect(String(row.Role ?? '')).toBe(String(sample.Role));
        const email = `${String(row.actorEmail ?? '')} ${String(row.targetEmail ?? '')} ${String(row.action ?? '')}`.toLowerCase();
        expect(email.includes(action.toLowerCase()), `search fields on ${String(row.id)}`).toBe(true);
      }
    }
  });

  test('ALD-004 an action prefix returns only matching master-data actions', async ({ api, env }) => {
    const prefixed = await listed(api, env, { page: 1, limit: 20, actionPrefix: 'meter.' }, 'meter action prefix');
    const meterCodes = ACTIONS.filter((action) => action.code.startsWith('meter.')).map((action) => action.code);
    for (const row of prefixed.data.logs) {
      expect(meterCodes, String(row.action)).toContain(row.action);
    }
    const missed = await api.get('masterDataAuditLogs', { query: { page: 1, limit: 20, actionPrefix: 'not-a-prefix' }, failOnStatus: false });
    expectApiContract(missed, validationErrorSchema, env.timeouts.api, 'unknown action prefix', { status: 400 });
  });

  test('ALD-005 the India instant matches UTC and a future day is empty', async ({ api, env }) => {
    const today = indiaToday();
    const from = `${today}T00:00:00+05:30`;
    const to = `${today}T23:59:59.999+05:30`;
    const offset = await listed(api, env, { page: 1, limit: 20, from, to }, 'India offset day');
    const utc = await listed(
      api,
      env,
      { page: 1, limit: 20, from: new Date(from).toISOString(), to: new Date(to).toISOString() },
      'same instant in UTC',
    );
    expect(utc.data.total).toBe(offset.data.total);
    for (const row of offset.data.logs) {
      const instant = rowInstant(row);
      expect(instant, `time on ${String(row.id)}`).not.toBeNull();
      expect(instant!).toBeGreaterThanOrEqual(new Date(from).getTime());
      expect(instant!).toBeLessThanOrEqual(new Date(to).getTime());
    }
    const fromOnly = await listed(api, env, { page: 1, limit: 20, from }, 'from without to');
    const toOnly = await listed(api, env, { page: 1, limit: 20, to }, 'to without from');
    expect(fromOnly.data.total).toBeGreaterThanOrEqual(offset.data.total);
    expect(toOnly.data.total).toBeGreaterThanOrEqual(offset.data.total);
    const tomorrow = shift(today, 1);
    const future = await listed(
      api,
      env,
      { page: 1, limit: 20, from: `${tomorrow}T00:00:00+05:30`, to: `${tomorrow}T23:59:59.999+05:30` },
      'future India day',
    );
    expect(future.data.total, 'a future day has no stored rows').toBe(0);
    expect(future.data.logs).toEqual([]);
  });

  test('ALD-006 repeating the list returns the same ids in the same order', async ({ api, env }) => {
    const query = { page: 1, limit: 20 };
    const first = await listed(api, env, query, 'activity logs first read');
    const second = await listed(api, env, query, 'activity logs second read');
    expect(second.data.logs.map((row) => String(row.id))).toEqual(first.data.logs.map((row) => String(row.id)));
    expect(second.data.total).toBe(first.data.total);
  });

  test('ALD-007 sizes from 1 to 100 are honored and a page past the end is empty', async ({ api, env }) => {
    const open = await listed(api, env, { page: 1, limit: 10 }, 'activity logs before size edges');
    for (const limit of [1, 11, 100]) {
      const sized = await listed(api, env, { page: 1, limit }, `activity logs limit ${limit}`);
      expect(sized.data.limit).toBe(limit);
      expect(sized.data.page).toBe(1);
      expect(sized.data.logs.length).toBeLessThanOrEqual(limit);
      expect(sized.data.total).toBe(open.data.total);
      expect(sized.data.totalPages).toBe(sized.data.total === 0 ? 0 : Math.ceil(sized.data.total / limit));
    }
    const past = Math.max(open.data.totalPages + 1, 2);
    const beyond = await listed(api, env, { page: past, limit: 10 }, 'activity logs past the last page');
    expect(beyond.data.page).toBe(past);
    expect(beyond.data.logs).toEqual([]);
    expect(beyond.data.total).toBe(open.data.total);
    expect(beyond.data.nextCursor === null || beyond.data.nextCursor === undefined).toBe(true);
  });

  test('ALD-008 a bad bearer is unauthorized', async ({ app, env }) => {
    const anonymous = new ApiClient(await playwrightRequest.newContext(), app, env);
    for (const endpoint of ['masterDataAuditLogs', 'permissionRoles'] as const) {
      const forged = await anonymous.get(endpoint, {
        query: endpoint === 'masterDataAuditLogs' ? { page: 1, limit: 20 } : undefined,
        headers: { Authorization: 'Bearer not-a-token' },
        failOnStatus: false,
      });
      expectUnauthorized(forged, env.timeouts.api, `${endpoint} bad bearer`, { sentToken: true });
    }
  });

  test('ALD-009 a write and the remaining rejected queries stay errors', async ({ api, env }) => {
    const write = await api.post('masterDataAuditLogs', { data: {}, failOnStatus: false });
    expect(write.status, 'activity logs does not accept a write').toBeGreaterThanOrEqual(400);
    expect(write.durationMs, 'activity logs write response time').toBeLessThanOrEqual(env.timeouts.api);
    const cases: { label: string; query: Record<string, string | number> }[] = [
      { label: 'role longer than 120', query: { page: 1, limit: 20, role: 'r'.repeat(121) } },
      { label: 'action longer than 50', query: { page: 1, limit: 20, action: 'a'.repeat(51) } },
      { label: 'cursor is not a uuid', query: { page: 1, limit: 20, cursor: 'not-a-cursor' } },
      { label: 'nextCursor is not a query key', query: { page: 1, limit: 20, nextCursor: '00000000-0000-4000-8000-000000000000' } },
      { label: 'user id is not a query key', query: { page: 1, limit: 20, userId: '00000000-0000-4000-8000-000000000000' } },
      { label: 'hierarchy id is not a query key', query: { page: 1, limit: 20, hierarchyId: '1' } },
      { label: 'from is not a date', query: { page: 1, limit: 20, from: 'tomorrow', to: 'tomorrow' } },
    ];
    for (const item of cases) {
      const result = await api.get('masterDataAuditLogs', { query: item.query, failOnStatus: false });
      expectApiContract(result, validationErrorSchema, env.timeouts.api, item.label, { status: 400 });
    }
    const ascending = await listed(api, env, { page: 1, limit: 10, sort: 'createdAt_asc' }, 'activity logs ascending');
    const times = ascending.data.logs.map(rowInstant).filter((value): value is number => value !== null);
    for (let index = 1; index < times.length; index += 1) {
      expect(times[index]).toBeGreaterThanOrEqual(times[index - 1]);
    }
  });
});

async function listed(
  api: ApiClient,
  env: EnvironmentConfig,
  query: Record<string, string | number>,
  label: string,
): Promise<ReturnType<typeof auditLogListSchema.parse>> {
  return expectAuthorizedContract(await api.get('masterDataAuditLogs', { query }), auditLogListSchema, env.timeouts.api, label);
}

function todayQuery(today: string, extra?: Record<string, string | number>): Record<string, string | number> {
  return {
    page: 1,
    limit: 20,
    from: `${today}T00:00:00+05:30`,
    to: `${today}T23:59:59.999+05:30`,
    ...extra,
  };
}

function indiaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function shift(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function rowInstant(row: Record<string, unknown>): number | null {
  for (const key of ['createdAt', 'Time']) {
    const value = row[key];
    if (typeof value !== 'string') continue;
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function assertRows(logs: Record<string, unknown>[]): void {
  const secret = /password|token|cookie|api[_-]?key/i;
  for (const row of logs) {
    const details = row.Details;
    if (details !== null && typeof details === 'object' && !Array.isArray(details)) {
      throw new Error(`ISSUE ALD-002: row ${String(row.id)} Details is an object, so the change text was dropped`);
    }
    const text = JSON.stringify(details ?? row.details ?? '');
    expect(secret.test(text), `secrets on ${String(row.id)}`).toBe(false);
    for (const key of ['Time', 'User', 'Role', 'Action', 'IP']) {
      const value = row[key];
      expect(value == null || typeof value === 'string' || typeof value === 'number', `${key} on ${String(row.id)}`).toBe(true);
    }
    if (Array.isArray(details)) {
      expect(details.every((line) => typeof line === 'string')).toBe(true);
    }
  }
}
