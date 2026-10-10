import { expect, functionality, test } from '../../../src/core/fixtures/test.fixtures';
import { dtrListSchema, metricsSchema } from '../../../src/core/api/dashboard.schemas';
import { DashboardPage } from '../../../src/pages/dashboard.page';

test.describe('Live monitoring @monitoring @regression', () => {
  functionality('Monitoring');

  test('After signing in, the operator can review DTRs and communication @smoke', async ({
    loginPage,
    api,
    data,
    app,
    page,
  }) => {
    const user = data.user('validAdmin');
    await api.authenticate(user);
    const dtrs = await api.getParsed('dtrs', dtrListSchema);
    const metrics = await api.getParsed('metrics', metricsSchema, { query: { metric: 'communication' } });

    await loginPage.open();
    await loginPage.signIn(user);
    await expect(page).toHaveURL(new RegExp(`${app.routes.consumers.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));

    const dashboard = new DashboardPage(page, app);
    await dashboard.expectReady();
    const first = dtrs.items[0];
    const row = await (await dashboard.dtrTable()).rowByRecordId(first.id);
    expect(row.DTR).toBe(first.code);
    expect(row.Load).toBe(`${first.load.value} ${first.load.unit}`);

    const chart = await dashboard.chart('communicationChart');
    await chart.waitForRender();
    expect(await chart.getTitle()).toBe(metrics.title);
    expect(await chart.getPlot()).toEqual(metrics.series);
  });
});
