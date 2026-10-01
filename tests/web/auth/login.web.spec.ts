import { expect, functionality, test } from '../../../src/core/fixtures/test.fixtures';
import { ConsumersPage } from '../../../src/pages/consumers.page';

test.describe('Sign-in page @auth @regression', () => {
  functionality('Authentication');

  test('admin can open the operations dashboard @smoke', async ({ loginPage, data, page, app }) => {
    await loginPage.open();
    await loginPage.signIn(data.user('validAdmin'));
    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(app.routes.consumers)}$`));
    await new ConsumersPage(page, app).expectReady();
  });

  test('invalid credentials stay on the sign-in page', async ({ loginPage, data, page, app }) => {
    await loginPage.open();
    await loginPage.signIn(data.invalidLogin('unknownPassword'));
    const error = await loginPage.error();
    await expect(error).toBeVisible();
    await expect(error).toContainText(/invalid/i);
    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(app.routes.login)}$`));
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
