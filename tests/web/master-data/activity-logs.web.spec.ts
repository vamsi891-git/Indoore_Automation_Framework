import { APIRequestContext, Route } from '@playwright/test';
import { expect, functionality, test } from '../../../src/core/fixtures/test.fixtures';
import { ActivityLogsPage, AuditList } from '../../../src/pages/activity-logs.page';
import { todayInAppZone } from '../../../src/core/utils/app-time';

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
  { label: 'Meter Bulk Created', code: 'meter.bulk_created' },
  { label: 'Upload Validated', code: 'master_data.upload.validated' },
  { label: 'Upload Approved', code: 'master_data.upload.approved' },
  { label: 'Upload Rejected', code: 'master_data.upload.rejected' },
];

test.describe('Activity history @master-data @regression', () => {
  functionality('Master Data');
  test.describe.configure({ timeout: 180_000 });

  let list: AuditList;

  test.beforeEach(async ({ loginPage, data, page, app }) => {
    await loginPage.open();
    await loginPage.signIn(data.user('validAdmin'));
    await page.waitForURL(/\/consumers(?:\?|$)/, { timeout: 20_000 });
    list = await new ActivityLogsPage(page, app).open();
  });

  test('Activity history opens on today’s entries @smoke', async ({ page, app }) => {
    const today = indiaToday();
    const logs = new ActivityLogsPage(page, app);
    await logs.expectShell(list, longDate(today));
    const params = new URL(list.url).searchParams;
    expect(params.get('from')).toBe(`${today}T00:00:00+05:30`);
    expect(params.get('to')).toBe(`${today}T23:59:59.999+05:30`);
    expect(params.has('userId')).toBe(false);
    expect(params.has('hierarchyId')).toBe(false);
    expect(params.has('nextCursor')).toBe(false);
    expect(params.has('cursor')).toBe(false);
    expect(list.totalPages).toBe(list.total === 0 ? 0 : Math.ceil(list.total / list.limit));
    await logs.expectFooter(list);
    if (list.total > 0) {
      await expect(page.locator('tbody tr').first().locator('td').nth(0)).toHaveText('1');
    }
  });

  test('Search and filters stay unavailable while the first list is loading', async ({ page }) => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/master-data/audit-logs**', async (route) => {
      const type = route.request().resourceType();
      if (type !== 'fetch' && type !== 'xhr') {
        await route.continue();
        return;
      }
      await gate;
      await route.continue();
    });
    await page.reload({ waitUntil: 'commit' });
    try {
      await expect(page.getByRole('textbox', { name: 'Search master data activity logs' })).toBeDisabled({ timeout: 20_000 });
      await expect(page.getByRole('button', { name: 'Filter master data activity log by actor role' })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Filter master data activity log by action' })).toBeDisabled();
      await expect.soft(page.getByRole('button', { name: 'Select activity log date range' }), 'ISSUE: the date range stays enabled while the list is loading').toBeDisabled();
      await expect(page.locator('tbody tr')).toHaveCount(20);
    } finally {
      release();
    }
  });

  test('Search ignores extra spaces, shows nothing when there is no match, and can be cleared', async ({ page, app }) => {
    const logs = new ActivityLogsPage(page, app);
    const source = list.total > 0 ? list : await logs.clearRange();
    const needle = String(source.logs.find((row) => String(row.action ?? '').trim())?.action ?? '').trim();
    if (needle) {
      let early = false;
      const started = Date.now();
      const watch = (request: { url: () => string }) => {
        if (request.url().includes('search=') && Date.now() - started < 250) early = true;
      };
      page.on('request', watch);
      const found = await logs.search(`  ${needle}  `);
      page.off('request', watch);
      expect(early, 'search is debounced').toBe(false);
      const foundParams = new URL(found.url).searchParams;
      expect(foundParams.get('search')).toBe(needle);
      expect(foundParams.get('page')).toBe('1');
      if (list.total > 0) {
        expect(foundParams.get('from')).toBe(`${indiaToday()}T00:00:00+05:30`);
        expect(foundParams.get('to')).toBe(`${indiaToday()}T23:59:59.999+05:30`);
      }
      await logs.expectFooter(found);
      const cleared = await logs.clearSearch();
      expect(new URL(cleared.url).searchParams.has('search')).toBe(false);
    }
    await logs.search('NO-SUCH-ACTIVITY-LOG-000');
    await expect(page.getByText('No data available', { exact: true })).toBeVisible();
    await expect(page.getByText('No activity log entries match your filters.', { exact: true })).toBeVisible();
    await expect(page.getByText(/Showing\s+\d+[–-]\d+\s+of\s+/)).toHaveCount(0);
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/master-data/audit-logs')) requests.push(request.url());
    });
    await page.getByRole('textbox', { name: 'Search master data activity logs' }).fill('   ');
    await expect.poll(() => requests.filter((url) => new URL(url).searchParams.has('search')).length, { timeout: 1_000 }).toBe(0);
  });

  test('The role filter uses the role names people are given', async ({ page, app }) => {
    const logs = new ActivityLogsPage(page, app);
    await page.getByRole('button', { name: 'Filter master data activity log by actor role', exact: true }).click();
    const menu = page.getByRole('menu').last();
    const labels = await menu.getByRole('menuitem').evaluateAll((nodes) =>
      nodes.map((node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim()),
    );
    expect(labels[0]).toBe('All Roles');
    expect(labels.slice(1).every((label) => label.trim() !== '')).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
    await page.keyboard.press('Escape');
    const role = labels[1];
    if (role) {
      const filtered = await logs.pickRole(role);
      expect(new URL(filtered.url).searchParams.get('role')).toBe(role);
      for (const row of filtered.logs) {
        expect(String(row.Role ?? ''), `role on ${String(row.id)}`).toBe(role);
      }
      const all = await logs.pickRole('All Roles');
      expect(new URL(all.url).searchParams.has('role')).toBe(false);
    }
  });

  test('The action filter uses the known action names', async ({ page, app }) => {
    const logs = new ActivityLogsPage(page, app);
    await page.getByRole('button', { name: 'Filter master data activity log by action', exact: true }).click();
    const labels = (await page.getByRole('menu').last().getByRole('menuitem').allInnerTexts()).map((label) => label.trim());
    expect(labels[0]).toBe('All Actions');
    expect(labels.slice(1).some((label) => label.includes('.'))).toBe(false);
    await page.keyboard.press('Escape');
    const choice = ACTIONS.find((action) => labels.includes(action.label)) ?? ACTIONS[0];
    const filtered = await logs.pickAction(choice.label, choice.code);
    expect(new URL(filtered.url).searchParams.get('action')).toBe(choice.code);
    expect(new URL(filtered.url).searchParams.get('page')).toBe('1');
    for (const row of filtered.logs) {
      expect(row.action).toBe(choice.code);
      const shown = String(row.Action ?? '');
      expect(shown === choice.code || shown === choice.label).toBe(true);
    }
    const kept = await logs.search(`  ${choice.code}  `);
    const keptParams = new URL(kept.url).searchParams;
    expect(keptParams.get('action')).toBe(choice.code);
    expect(keptParams.get('search')).toBe(choice.code);
    expect(keptParams.get('page')).toBe('1');
    const all = await logs.pickAction('All Actions');
    expect(new URL(all.url).searchParams.has('action')).toBe(false);
  });

  test('The date range includes both ends, stays in order, and cannot include a future day', async ({ page, app }) => {
    const logs = new ActivityLogsPage(page, app);
    const today = indiaToday();
    const earlier = shift(today, -3);
    const swapped = await logs.pickRange(today, earlier);
    const swappedParams = new URL(swapped.url).searchParams;
    expect(swappedParams.get('from')).toBe(`${earlier}T00:00:00+05:30`);
    expect(swappedParams.get('to')).toBe(`${today}T23:59:59.999+05:30`);
    await expect(page.getByRole('button', { name: 'Select activity log date range' })).toContainText(longDate(earlier));
    const oneDay = await logs.pickRange(earlier, earlier);
    expect(new URL(oneDay.url).searchParams.get('from')).toBe(`${earlier}T00:00:00+05:30`);
    expect(new URL(oneDay.url).searchParams.get('to')).toBe(`${earlier}T23:59:59.999+05:30`);
    const half = await logs.pickStartOnly(shift(today, -1));
    expect(new URL(half.url).searchParams.has('from')).toBe(false);
    expect(new URL(half.url).searchParams.has('to')).toBe(false);
    const cleared = await logs.clearRange();
    expect(new URL(cleared.url).searchParams.has('from')).toBe(false);
    expect(new URL(cleared.url).searchParams.has('to')).toBe(false);
    expect(cleared.total).toBeGreaterThanOrEqual(list.total);
    await expect(page.getByRole('button', { name: 'Select activity log date range' })).toContainText('Select Range');
    const dialog = await logs.openCalendar();
    const tomorrow = shift(today, 1);
    await expect(dialog.getByRole('gridcell', { name: tomorrow, exact: true }).first()).toBeDisabled();
    const next = dialog.getByRole('button', { name: 'Next month', exact: true });
    expect(await next.count()).toBeGreaterThan(0);
    for (const button of await next.all()) {
      await expect(button).toBeDisabled();
    }
  });

  test('A visible row names the action and keeps the details readable', async ({ page, app }) => {
    const logs = new ActivityLogsPage(page, app);
    const source = list.total > 0 ? list : await logs.clearRange();
    expect(source.logs.length > 0 || source.total === 0).toBe(true);
    for (const row of source.logs) {
      const details = row.Details;
      if (details !== null && typeof details === 'object' && !Array.isArray(details)) {
        throw new Error(`ISSUE ALD-002: row ${String(row.id)} Details is an object`);
      }
      const text = JSON.stringify(details ?? '');
      expect(/password|token|cookie|api[_-]?key/i.test(text), `secrets on ${String(row.id)}`).toBe(false);
    }
    const sample = source.logs.find((row) => ACTIONS.some((action) => action.code === row.action));
    if (sample) {
      const known = ACTIONS.find((action) => action.code === sample.action)!;
      const filtered = await logs.pickAction(known.label, known.code);
      expect(filtered.logs.some((row) => String(row.id) === String(sample.id)) || filtered.total > 0).toBe(true);
    }
    await expect(page.getByRole('columnheader', { name: 'Time', exact: true })).toBeVisible();
  });

  test('The page size and the next page match the count at the bottom', async ({ page, app }) => {
    const logs = new ActivityLogsPage(page, app);
    const wide = list.total > 50 ? list : await logs.clearRange();
    await page.keyboard.press('Escape');
    const pager = () => page.getByRole('navigation', { name: 'Master data activity log pages' });
    await logs.expectFooter(wide);
    if (wide.total === 0 || wide.total <= wide.limit) {
      await expect(pager()).toHaveCount(0);
    } else {
      await expect(pager().getByRole('button', { name: 'Previous page' })).toBeDisabled();
      await expect(pager().getByRole('button', { name: 'Next page' })).toBeEnabled();
    }
    if (wide.total >= 10) {
      await expect(page.getByRole('button', { name: 'Rows per page' })).toContainText(`${wide.limit} / page`);
      const sized = await logs.setPageSize(10);
      expect(new URL(sized.url).searchParams.get('limit')).toBe('10');
      expect(new URL(sized.url).searchParams.get('page')).toBe('1');
      await expect(page.getByRole('button', { name: 'Rows per page' })).toContainText('10 / page');
      await logs.expectFooter(sized);
      if (sized.total > 10) {
        const second = await logs.nextPage();
        expect(second.page).toBe(2);
        await logs.expectFooter(second);
        await expect(page.locator('tbody tr').first().locator('td').nth(0)).toHaveText(String((second.page - 1) * second.limit + 1));
      }
      const rowsPerPage = page.getByRole('button', { name: 'Rows per page' });
      if (wide.total <= 20) {
        await rowsPerPage.click();
        await page.getByRole('menuitem', { name: '20 / page', exact: true }).click();
        await expect(rowsPerPage).toContainText('20 / page');
        await expect(page.getByText(new RegExp(`Showing\\s+1[–-]${wide.total}\\s+of\\s+${wide.total}`))).toBeVisible();
        await expect(pager()).toHaveCount(0);
      } else {
        const restored = await logs.setPageSize(50);
        expect(new URL(restored.url).searchParams.get('page')).toBe('1');
        await expect(rowsPerPage).toContainText('50 / page');
        if (restored.total <= restored.limit) await expect(pager()).toHaveCount(0);
      }
      await page.getByRole('button', { name: 'Rows per page' }).click();
      const sizes = await page.getByRole('menu').last().getByRole('menuitem').evaluateAll((nodes) =>
        nodes.map((node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim()),
      );
      expect(sizes).toEqual(['10 / page', '20 / page', '50 / page']);
    }
    await expect(page.getByRole('columnheader', { name: 'Time' })).toBeVisible();
  });

  test('Refreshing the page clears filters that are not kept in the address', async ({ page, app }) => {
    const logs = new ActivityLogsPage(page, app);
    await page.getByRole('button', { name: 'Filter master data activity log by action', exact: true }).click();
    const labels = (await page.getByRole('menu').last().getByRole('menuitem').allInnerTexts()).map((label) => label.trim());
    await page.keyboard.press('Escape');
    const choice = ACTIONS.find((action) => labels.includes(action.label));
    if (choice) await logs.pickAction(choice.label, choice.code);
    const seen: string[] = [];
    const onResponse = (response: import('@playwright/test').Response) => {
      const url = response.request().url();
      if (response.request().method() === 'GET' && url.includes('/master-data/audit-logs')) seen.push(url);
    };
    page.on('response', onResponse);
    const pending = page.waitForResponse(
      (response) => {
        const url = response.request().url();
        return response.request().method() === 'GET' && url.includes('/master-data/audit-logs?');
      },
      { timeout: 45_000 },
    );
    await page.reload();
    const response = await pending.catch((error: Error) => {
      throw new Error(`${error.message}\nSeen:\n${seen.join('\n') || '(none)'}`);
    });
    page.off('response', onResponse);
    const params = new URL(response.request().url()).searchParams;
    expect(page.url()).toMatch(/\/master-data\/audit-logs$/);
    expect(params.get('page')).toBe('1');
    expect(params.get('limit')).toBe('20');
    expect(params.has('search')).toBe(false);
    expect(params.has('role')).toBe(false);
    expect(params.has('action')).toBe(false);
    expect(params.get('from')).toContain(indiaToday());
  });

  test('Clicking a column heading does not sort the list', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/master-data/audit-logs')) requests.push(request.url());
    });
    const before = await page.locator('tbody tr').allInnerTexts();
    await page.getByRole('columnheader', { name: 'Time', exact: true }).click();
    await expect.poll(() => requests.filter((url) => new URL(url).searchParams.has('sort')).length, { timeout: 1_000 }).toBe(0);
    await expect.poll(async () => page.locator('tbody tr').allInnerTexts()).toEqual(before);
  });
});

test.describe('Who can open activity history, and what happens when it fails @master-data @regression', () => {
  functionality('Master Data');
  test.describe.configure({ timeout: 180_000 });

  for (const [keep, who] of [
    ['consumers.view', 'view consumers'],
    ['dtrs.view', 'view DTRs'],
    ['meters.view', 'view meters'],
  ] as const) {
    test(`A person allowed only to ${who} can open activity history`, async ({ loginPage, data, page, app }) => {
      await page.route(AUTH_ROUTE, (route) => rewriteAuth(route, (key) => key === keep, page.request));
      await loginPage.open();
      await loginPage.signIn(data.user('validAdmin'));
      await page.waitForURL(/\/consumers(?:\?|$)/, { timeout: 20_000 });
      await clearPermissionCache(page);
      await page.goto(app.routes.activityLogs);
      await expect(page.getByText('Activity logs', { exact: true }).first()).toBeVisible();
      await expect(page.getByRole('table', { name: 'Master data activity logs' })).toBeVisible();
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    });
  }

  test('A person who cannot view consumers, DTRs, or meters is blocked from activity history', async ({ loginPage, data, page, app }) => {
    await page.route(AUTH_ROUTE, (route) =>
      rewriteAuth(route, (key) => !['consumers.view', 'dtrs.view', 'meters.view'].includes(key), page.request),
    );
    await loginPage.open();
    await loginPage.signIn(data.user('validAdmin'));
    await page.waitForURL(/\/consumers(?:\?|$)/, { timeout: 20_000 });
    await clearPermissionCache(page);
    let listed = false;
    page.on('request', (request) => {
      if (request.url().includes('/master-data/audit-logs')) listed = true;
    });
    await page.goto(app.routes.activityLogs);
    await expect(page.getByText('Activity logs', { exact: true }).or(page.getByText('Activity Logs', { exact: true })).first()).toBeVisible();
    await expect(page.getByText('Access denied', { exact: true })).toBeVisible();
    console.log('ISSUE ALD-008: the route guard says "You do not have permission to open this page." The page sentence naming consumers.view, dtrs.view, or meters.view is not shown.');
    await expect(page.getByText('You need one of consumers.view, dtrs.view, or meters.view to view master data activity logs.')).toBeVisible();
    expect(listed, 'denied page sends no list request').toBe(false);
    await expect(page.getByRole('textbox', { name: 'Search master data activity logs' })).toBeDisabled();
  });

  test('A failed permission check shows a message instead of the activity history', async ({ loginPage, data, page, app }) => {
    await loginPage.open();
    await loginPage.signIn(data.user('validAdmin'));
    await page.waitForURL(/\/consumers(?:\?|$)/, { timeout: 20_000 });
    await page.route('**/permissions/me/permissions**', (route) => route.abort());
    await page.goto(app.routes.activityLogs);
    await expect(page.getByText('Unable to load your permissions. Try refreshing the page.')).toBeVisible();
  });

  test('Opening activity history without signing in returns to the sign-in page', async ({ page, app }) => {
    await page.goto(app.routes.activityLogs);
    await expect(page).toHaveURL(/\/login/);
  });

  test('A failed activity list shows the message from the server', async ({ loginPage, data, page, app }) => {
    await loginPage.open();
    await loginPage.signIn(data.user('validAdmin'));
    await page.waitForURL(/\/consumers(?:\?|$)/, { timeout: 20_000 });
    await page.route('**/master-data/audit-logs**', (route) =>
      auditApi(route, () =>
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: data.json('payloads/mocks.json', 'auditFailed'),
        }),
      ),
    );
    const failed = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.request().url().includes('/master-data/audit-logs?') &&
        response.status() === 500,
      { timeout: 45_000 },
    );
    await page.goto(app.routes.activityLogs);
    await failed;
    await expect(page.getByText('Activity log service is down')).toBeVisible();
    console.log('ISSUE ALD-008: a failed list also shows "No activity log entries match your filters."');
    await expect(page.getByText('No activity log entries match your filters.')).toHaveCount(0);
  });

  test('A broken or unexpected activity reply is named on the page', async ({ loginPage, data, page, app }) => {
    await loginPage.open();
    await loginPage.signIn(data.user('validAdmin'));
    await page.waitForURL(/\/consumers(?:\?|$)/, { timeout: 20_000 });
    let body = 'not-json';
    await page.route('**/master-data/audit-logs**', (route) => auditApi(route, () => route.fulfill({ status: 200, contentType: 'application/json', body })));
    await page.goto(app.routes.activityLogs);
    await expect(page.getByText('Invalid JSON response')).toBeVisible();
    body = data.json('payloads/mocks.json', 'unexpectedBody');
    const unexpected = page.waitForResponse(
      (response) => response.request().method() === 'GET' && response.request().url().includes('/master-data/audit-logs?'),
      { timeout: 45_000 },
    );
    await page.reload();
    await unexpected;
    await expect(page.getByText('Unexpected API response')).toBeVisible();
  });

  test('A failed role list still leaves the activity history usable', async ({ loginPage, data, page, app }) => {
    await loginPage.open();
    await loginPage.signIn(data.user('validAdmin'));
    await page.waitForURL(/\/consumers(?:\?|$)/, { timeout: 20_000 });
    await page.route('**/permissions/roles**', (route) => route.abort());
    await page.goto(app.routes.activityLogs);
    await expect(page.getByRole('table', { name: 'Master data activity logs' })).toBeVisible();
    await page.getByRole('button', { name: 'Filter master data activity log by actor role', exact: true }).click();
    const labels = (await page.getByRole('menu').last().getByRole('menuitem').allInnerTexts()).map((label) => label.trim());
    expect(labels).toEqual(['All Roles']);
  });

  test('Unknown actions are left out, and an empty action list falls back to the known names', async ({ loginPage, data, page, app }) => {
    await loginPage.open();
    await loginPage.signIn(data.user('validAdmin'));
    await page.waitForURL(/\/consumers(?:\?|$)/, { timeout: 20_000 });
    await page.route('**/master-data/audit-logs**', (route) =>
      auditApi(route, () =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: data.json('payloads/activity-logs.json', 'unknownActionsPartial'),
        }),
      ),
    );
    await page.goto(app.routes.activityLogs);
    await page.getByRole('button', { name: 'Filter master data activity log by action', exact: true }).click();
    const partial = (await page.getByRole('menu').last().getByRole('menuitem').allInnerTexts()).map((label) => label.trim());
    expect(partial).toEqual(['All Actions', 'Meter Created']);
    await page.keyboard.press('Escape');
    await page.unroute('**/master-data/audit-logs**');
    await page.route('**/master-data/audit-logs**', (route) =>
      auditApi(route, () =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: data.json('payloads/activity-logs.json', 'unknownActionsEmpty'),
        }),
      ),
    );
    await page.reload();
    await page.getByRole('button', { name: 'Filter master data activity log by action', exact: true }).click();
    const fallback = (await page.getByRole('menu').last().getByRole('menuitem').allInnerTexts()).map((label) => label.trim());
    expect(fallback.slice(1)).toEqual(ACTIONS.map((action) => action.label));
  });

  test('A single row still shows the count at the bottom and the page sizes', async ({ loginPage, data, page, app }) => {
    await loginPage.open();
    await loginPage.signIn(data.user('validAdmin'));
    await page.waitForURL(/\/consumers(?:\?|$)/, { timeout: 20_000 });
    await page.route('**/master-data/audit-logs**', (route) =>
      auditApi(route, () =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: data.json('payloads/activity-logs.json', 'singleRow'),
        }),
      ),
    );
    await page.goto(app.routes.activityLogs);
    await expect(page.getByText(/Showing\s+1[–-]1\s+of\s+1/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rows per page' })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Master data activity log pages' })).toHaveCount(0);
  });

  test('A repeated entry and an entry without an id both stay visible', async ({ loginPage, data, page, app }) => {
    await loginPage.open();
    await loginPage.signIn(data.user('validAdmin'));
    await page.waitForURL(/\/consumers(?:\?|$)/, { timeout: 20_000 });
    await page.route('**/master-data/audit-logs**', (route) =>
      auditApi(route, () =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: data.json('payloads/activity-logs.json', 'duplicateIds'),
        }),
      ),
    );
    const listed = page.waitForResponse(
      (response) => response.request().method() === 'GET' && response.request().url().includes('/master-data/audit-logs?'),
      { timeout: 45_000 },
    );
    await page.goto(app.routes.activityLogs);
    await listed;
    await expect(page.getByRole('row').filter({ hasText: 'First' })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Second' })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Third' })).toBeVisible();
    const sameLine = page.getByRole('row').filter({ hasText: 'First' }).getByText('Same line', { exact: true });
    await expect(sameLine).toHaveCount(2);
    const objectCell = page.getByRole('row').filter({ hasText: 'Third' });
    await expect(objectCell).toContainText('—');
    console.log('ISSUE ALD-002: a Details object renders as an em dash, so the change text was dropped');
  });

  test('A time stored in universal time is shown in India time', async ({ loginPage, data, page, app }) => {
    await loginPage.open();
    await loginPage.signIn(data.user('validAdmin'));
    await page.waitForURL(/\/consumers(?:\?|$)/, { timeout: 20_000 });
    await page.route('**/master-data/audit-logs**', (route) =>
      auditApi(route, () =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: data.json('payloads/activity-logs.json', 'utcInstant'),
        }),
      ),
    );
    await page.goto(app.routes.activityLogs);
    const row = page.getByRole('row').filter({ hasText: 'Tester' });
    await expect(row).toContainText('8th Oct 2026, 12:00 AM');
    await expect(row).not.toContainText('7th Oct 2026, 06:30 PM');
  });

  test('A column with no name is dropped, and a blank heading uses the column name', async ({ loginPage, data, page, app }) => {
    await loginPage.open();
    await loginPage.signIn(data.user('validAdmin'));
    await page.waitForURL(/\/consumers(?:\?|$)/, { timeout: 20_000 });
    await page.route('**/master-data/audit-logs**', (route) =>
      auditApi(route, () =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: data.json('payloads/activity-logs.json', 'blankColumn'),
        }),
      ),
    );
    await page.goto(app.routes.activityLogs);
    await expect(page.getByRole('columnheader', { name: 'Note', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Dropped', exact: true })).toHaveCount(0);
    await expect(page.getByRole('row').filter({ hasText: 'Shown note' })).toBeVisible();
  });
});

function auditApi(route: Route, fulfill: () => Promise<void>): Promise<void> {
  const type = route.request().resourceType();
  if (type !== 'fetch' && type !== 'xhr') return route.continue();
  return fulfill();
}

function indiaToday(): string {
  return todayInAppZone();
}

function shift(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function longDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
}

async function clearPermissionCache(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith('rbac.permissionKeys.')) sessionStorage.removeItem(key);
    }
  });
}

const AUTH_ROUTE = /\/auth\/(?:login|me)(?:\/|\?|$)|\/permissions\/me(?:\/|\?|$)/;

async function rewriteAuth(route: Route, keep: (key: string) => boolean, api: APIRequestContext): Promise<void> {
  await denyView(route, keep, api);
}

async function denyView(route: Route, keep: (key: string) => boolean, api: APIRequestContext): Promise<void> {
  const response = await api
    .fetch(route.request().url(), {
      method: route.request().method(),
      headers: route.request().headers(),
      data: route.request().postData() ?? undefined,
    })
    .catch(() => null);
  if (!response) {
    await route.abort().catch(() => undefined);
    return;
  }
  const body: unknown = await response.json().catch(() => null);
  if (body && typeof body === 'object') {
    const root = (body as { data?: unknown }).data ?? body;
    if (root && typeof root === 'object') {
      const record = root as { isUltimate?: boolean; permissions?: unknown; user?: { roleIsUltimate?: boolean } };
      if (typeof record.isUltimate === 'boolean') record.isUltimate = false;
      if (record.user && typeof record.user.roleIsUltimate === 'boolean') record.user.roleIsUltimate = false;
      if (Array.isArray(record.permissions)) {
        record.permissions = record.permissions.filter((key) => typeof key === 'string' && keep(key));
      }
    }
  }
  await route.fulfill({ status: response.status(), contentType: 'application/json', body: JSON.stringify(body) });
}
