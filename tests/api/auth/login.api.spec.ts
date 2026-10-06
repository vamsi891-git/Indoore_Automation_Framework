import { expect, functionality, test } from '../../../src/core/fixtures/test.fixtures';
import type { TypeAssertion } from '../../../src/core/api/schema.validator';
import { expectApiHeaders } from '../support/expect-api-headers';

test.describe('Authentication API @auth @regression', () => {
  functionality('Authentication');

  test('returns a typed access token @smoke', async ({ api, data }) => {
    const result = await api.authenticate(data.user('validAdmin'));
    expect(result.status).toBe(200);
    expectApiHeaders(result, { hasBody: true });
    expect(result.body).toMatchJsonSchema('login');
    expect(result.body).toMatchDataTypes(data.read<TypeAssertion[]>('api/login-type-assertions.json'));
    expect(result.body.data.user.email).toBe(data.user('validAdmin').email);
  });

  test('rejects unknown credentials', async ({ api, data }) => {
    const result = await api.post('login', {
      data: data.invalidLogin('unknownPassword'),
      expectedStatus: 401,
    });
    expect(result.body).toMatchJsonSchema('error');
    expectApiHeaders(result, { hasBody: true });
  });
});
