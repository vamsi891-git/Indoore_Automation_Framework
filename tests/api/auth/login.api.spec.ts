import { expect, functionality, test } from '../../../src/core/fixtures/test.fixtures';
import { errorSchema, loginSchema } from '../../../src/core/api/dashboard.schemas';
import { validateDataTypes, type TypeAssertion } from '../../../src/core/api/schema.validator';
import { expectApiHeaders } from '../support/expect-api-headers';

test.describe('Authentication API @auth @regression', () => {
  functionality('Authentication');

  test('returns a typed access token @smoke', async ({ api, data }) => {
    const result = await api.authenticate(data.user('validAdmin'));
    expect(result.status).toBe(200);
    expectApiHeaders(result, { hasBody: true });
    loginSchema.parse(result.body);
    expect(loginSchema.safeParse(data.payload('payloads/mocks.json', 'badLoginShape')).success, 'a login body with a bad shape fails').toBe(false);
    expect(validateDataTypes(result.body, data.read<TypeAssertion[]>('api/login-type-assertions.json'))).toEqual([]);
    expect(result.body.data.user.email).toBe(data.user('validAdmin').email);
  });

  test('rejects unknown credentials', async ({ api, data }) => {
    const result = await api.post('login', {
      data: data.invalidLogin('unknownPassword'),
      expectedStatus: 401,
    });
    errorSchema.parse(result.body);
    expectApiHeaders(result, { hasBody: true });
  });
});
