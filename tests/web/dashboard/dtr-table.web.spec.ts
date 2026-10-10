import { expect, functionality, requireFeature, test } from '../../../src/core/fixtures/test.fixtures';
import { dtrListSchema } from '../../../src/core/api/dashboard.schemas';
import { DashboardPage } from '../../../src/pages/dashboard.page';

test.describe('DTR table on the dashboard @dashboard @assets @regression', () => {
  functionality('Dashboard');

  test('The table shows the same DTRs the server returned', async ({ loginPage, data, page, api, app }) => {
    console.log('ISSUE: this test calls GET /asset-management/dtrs and expects a Dashboard Overview table. That route returns 404. The live screen is DTR Overview at /dtr/dashboard.');
    test.skip(true, 'The live app does not have this DTR table. DTR Overview covers that screen.');
    await loginPage.open();
    await loginPage.signIn(data.user('validAdmin'));
    const dashboardPage = new DashboardPage(page, app);
    requireFeature(app, 'assets');
    const dtrs = await api.getParsed('dtrs', dtrListSchema);
    await dashboardPage.open();
    await expect(await dashboardPage.pageTitle()).toBeVisible();

    const table = await dashboardPage.dtrTable();
    expect(await table.rows()).toHaveLength(dtrs.items.length);
    for (const dtr of dtrs.items) {
      const row = await table.rowByRecordId(dtr.id);
      expect(row.DTR).toBe(dtr.code);
      expect(row.Locality).toBe(dtr.locality);
      expect(row.Circle).toBe(dtr.circle);
      expect(row.Status).toBe(dtr.status);
      expect(row.Load).toBe(`${dtr.load.value} ${dtr.load.unit}`);
    }
  });

  test('Opening DTRs scrolls the table into view', async ({ loginPage, data, page, app }) => {
    console.log('ISSUE: this test looks for the text "Dashboard Overview". The live app does not have that screen.');
    test.skip(true, 'The live app does not have a Dashboard Overview screen.');
    await loginPage.open();
    await loginPage.signIn(data.user('validAdmin'));
    const dashboardPage = new DashboardPage(page, app);
    requireFeature(app, 'dashboard');
    await dashboardPage.open();
    await dashboardPage.goTo('navDtrs');
    await expect((await dashboardPage.dtrTable()).root).toBeInViewport();
  });
});
