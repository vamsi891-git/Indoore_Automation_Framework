import { expect, functionality, test } from '../../../src/core/fixtures/test.fixtures';
import { ConsumersPage } from '../../../src/pages/consumers.page';

test.describe('Sign-in @auth @regression', () => {
  functionality('Authentication');

  test('An administrator can sign in and reach the consumer area @smoke', async ({ loginPage, data, page, app }) => {
    await loginPage.open();
    await loginPage.signIn(data.user('validAdmin'));
    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(app.routes.consumers)}$`), { timeout: 20_000 });
    await new ConsumersPage(page, app).expectReady();
  });

  test('A wrong password stays on the sign-in page', async ({ loginPage, data, page, app }) => {
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
