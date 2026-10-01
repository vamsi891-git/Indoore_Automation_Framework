import { expect, functionality, requireFeature, test } from '../../../src/core/fixtures/test.fixtures';
import { dtrListSchema } from '../../../src/core/api/models';

test.describe('Indore DTR dashboard @dashboard @assets @regression', () => {
  functionality('Dashboard');

  test('table shows the DTR API records', async ({ dashboardPage, api, app }) => {
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

  test('DTR navigation scrolls the table into view', async ({ dashboardPage, app }) => {
    requireFeature(app, 'dashboard');
    await dashboardPage.open();
    await dashboardPage.goTo('navDtrs');
    await expect((await dashboardPage.dtrTable()).root).toBeInViewport();
  });
});
