import { expect } from '@playwright/test';
import type { ZodType } from 'zod';
import type { ApiResult } from '../../../src/core/api/api.client';
import { errorSchema } from '../../../src/core/api/dashboard.schemas';
import { appTimeZone } from '../../../src/core/utils/app-time';
import { expectApiHeaders } from './expect-api-headers';

export function expectApiContract<T>(
  result: ApiResult<unknown>,
  schema: ZodType<T>,
  limitMs: number,
  label: string,
  options?: { status?: number; authorized?: boolean; hasBody?: boolean },
): T {
  const status = options?.status ?? 200;
  expect(result.status, `${label} status`).toBe(status);
  expect(result.durationMs, `${label} response time ${result.durationMs}ms`).toBeLessThanOrEqual(limitMs);
  expectApiHeaders(result, { authorized: options?.authorized ?? true, hasBody: options?.hasBody });
  return schema.parse(result.body);
}

export function expectAuthorizedContract<T>(
  result: ApiResult<unknown>,
  schema: ZodType<T>,
  limitMs: number,
  label: string,
): T {
  return expectApiContract(result, schema, limitMs, label);
}

export function expectUnauthorized(
  result: ApiResult<unknown>,
  limitMs: number,
  label: string,
  options?: { sentToken?: boolean },
): void {
  expect(result.status, `${label} status`).toBe(401);
  expect(result.durationMs, `${label} response time`).toBeLessThanOrEqual(limitMs);
  expectApiHeaders(result, { authorized: options?.sentToken === true });
  errorSchema.parse(result.body);
}

export function totalCount(data: unknown, label: string): number {
  const total = findTotal(data);
  expect(total, `${label} totalCount`).toEqual(expect.any(Number));
  expect(Number.isFinite(total), `${label} totalCount`).toBe(true);
  expect(total, `${label} totalCount`).toBeGreaterThanOrEqual(0);
  return total;
}

function findTotal(data: unknown): number {
  if (!isRecord(data)) {
    throw new Error('totalCount is not on a JSON object');
  }
  const direct = [data.totalCount, data.total, data.totalMeterCount, data.totalConsumerMeters];
  for (const value of direct) {
    if (typeof value === 'number') {
      return value;
    }
  }
  if (isRecord(data.pagination) && typeof data.pagination.total === 'number') {
    return data.pagination.total;
  }
  if (isRecord(data.totalDtrs) && typeof data.totalDtrs.count === 'number') {
    return data.totalDtrs.count;
  }
  if (isRecord(data.consumerType) && isRecord(data.consumerType.totalConsumers) && typeof data.consumerType.totalConsumers.count === 'number') {
    return data.consumerType.totalConsumers.count;
  }
  if (isRecord(data.connectionStatus) && typeof data.connectionStatus.totalMeterCount === 'number') {
    return data.connectionStatus.totalMeterCount;
  }
  if (Array.isArray(data.items)) {
    return data.items.reduce<number>((sum, item) => {
      if (!isRecord(item)) {
        return sum;
      }
      const value = item.value ?? item.count;
      return sum + (typeof value === 'number' ? value : 0);
    }, 0);
  }
  throw new Error(`No totalCount. Keys: ${Object.keys(data).join(', ')}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function kolkataMonthQuery(): { monthYear: string; fromDate: string; toDate: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: appTimeZone(),
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  const monthYear = `${year}-${month}`;
  const last = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  return {
    monthYear,
    fromDate: `${monthYear}-01`,
    toDate: `${monthYear}-${String(last).padStart(2, '0')}`,
  };
}
