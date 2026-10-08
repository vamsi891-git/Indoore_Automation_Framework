import { expect, functionality, test } from '../../../src/core/fixtures/test.fixtures';
import { auditLogListSchema } from '../../../src/core/api/dashboard.schemas';
import { ActivityLogsPage } from '../../../src/pages/activity-logs.page';

test.describe('Activity logs UI versus API @master-data @regression', () => {
  functionality('Master Data');
  test.describe.configure({ timeout: 180_000 });

  test('the footer total matches the list the page requested', async ({ loginPage, api, data, page, app, env }) => {
    await api.authenticate(data.user('validAdmin'));
    await loginPage.open();
    await loginPage.signIn(data.user('validAdmin'));
    await page.waitForURL(/\/consumers(?:\?|$)/, { timeout: 20_000 });
    const logs = new ActivityLogsPage(page, app);
    const list = await logs.open();
    const params = new URL(list.url).searchParams;
    const query: Record<string, string> = {};
    params.forEach((value, key) => {
      query[key] = value;
    });
    const body = await api.getParsed('masterDataAuditLogs', auditLogListSchema, { query, timeout: env.timeouts.api });
    expect(body.data.total).toBe(list.total);
    expect(body.data.page).toBe(list.page);
    expect(body.data.limit).toBe(list.limit);
    expect(list.columns.map((column) => column.header)).toEqual(body.data.columns.map((column) => column.header));
    expect(params.has('userId')).toBe(false);
    expect(params.has('hierarchyId')).toBe(false);
    expect(params.has('sort')).toBe(false);
    if (body.data.logs.length > 0) {
      await expect(page.getByRole('table', { name: 'Master data activity logs' }).locator('tbody tr')).toHaveCount(body.data.logs.length);
    }
    await logs.expectFooter(list);
    const needle = String(body.data.logs.find((row) => String(row.action ?? '').trim())?.action ?? '').trim();
    if (needle) {
      const found = await logs.search(`  ${needle}  `);
      const foundParams = new URL(found.url).searchParams;
      const filteredQuery: Record<string, string> = {};
      foundParams.forEach((value, key) => {
        filteredQuery[key] = value;
      });
      const filtered = await api.getParsed('masterDataAuditLogs', auditLogListSchema, { query: filteredQuery, timeout: env.timeouts.api });
      expect(filtered.data.total).toBe(found.total);
      expect(filtered.data.page).toBe(1);
      await logs.expectFooter(found);
    }
  });
});
