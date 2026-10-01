import { expect } from '@playwright/test';
import type { ApiResult } from '../../src/core/api/api.client';

export function expectApiHeaders(
  result: Pick<ApiResult<unknown>, 'contentType' | 'requestHeaders'>,
  options?: { authorized?: boolean; hasBody?: boolean },
): void {
  expect(result.contentType, 'response Content-Type').toContain('application/json');
  expect(result.requestHeaders.Accept, 'request Accept').toBe('application/json');
  if (options?.hasBody) {
    expect(result.requestHeaders['Content-Type'], 'request Content-Type').toBe('application/json');
  }
  if (options?.authorized) {
    expect(result.requestHeaders.Authorization, 'request Authorization').toMatch(/^Bearer\s+\S+/);
  } else {
    expect(result.requestHeaders.Authorization, 'request must not send Authorization').toBeUndefined();
  }
}
