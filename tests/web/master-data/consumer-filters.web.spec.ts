import { expect, functionality, test } from '../../../src/core/fixtures/test.fixtures';
import { ConsumerList, ConsumerMasterDataPage } from '../../../src/pages/consumer-master-data.page';

test.describe('Consumer list filters @master-data @regression', () => {
  functionality('Master Data');
  test.describe.configure({ timeout: 90_000 });

  let list: ConsumerList;

  test.beforeEach(async ({ loginPage, data, page, app }) => {
    await loginPage.open();
    await loginPage.signIn(data.user('validAdmin'));
    await page.waitForURL(/\/consumers(?:\?|$)/, { timeout: 20_000 });
    list = await new ConsumerMasterDataPage(page, app).open();
  });

  test('Every organisation level and every filter option narrows the consumer list', async ({ page, app }) => {
    test.setTimeout(900_000);
    expect(list.total, 'consumer list').toBeGreaterThan(0);
    await new ConsumerMasterDataPage(page, app).expectEveryFilter(list.total);
  });

  test('A communication status of never communicated is ignored', async ({ page, app }) => {
    const pending = page.waitForResponse(
      (response) => response.url().includes('/master-data/consumer-master-data') && response.request().method() === 'GET',
    );
    await page.goto(`${app.routes.consumerData}?communicationStatus=never-communicated`);
    const params = new URL((await pending).url()).searchParams;
    expect(params.has('communicationStatus'), 'communicationStatus').toBe(false);
    expect(params.get('meterType')).toBe('all');
  });
});
