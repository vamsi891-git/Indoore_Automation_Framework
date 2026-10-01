import { expect, functionality, test } from '../../../src/core/fixtures/test.fixtures';
import { DashboardPage } from '../../../src/pages/dashboard.page';
const assetCards = ['substationsCard', 'feedersCard', 'dtrsCard', 'consumersCard'] as const;
test.describe('Dashboard overview @dashboard @regression', () => {
  functionality('Dashboard');
  test('admin can open the dashboard from consumers @smoke', async ({ loginPage, data, page, app }) => {
    await loginPage.open();
    await loginPage.signIn(data.user('validAdmin'));
    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(app.routes.consumers)}$`));
    const dashboard = new DashboardPage(page, app);
    await dashboard.openFromConsumers();
    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(app.routes.dashboard)}$`));
    await expect(await dashboard.pageTitle()).toBeVisible();
    await expect(await dashboard.updateKpis()).toBeVisible();
    for (const card of assetCards) {
      await expect(await dashboard.card(card)).toBeVisible();
    }
    await expect(await dashboard.assetMap()).toBeVisible();
    await expect(await dashboard.mapSearch()).toBeVisible();
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
