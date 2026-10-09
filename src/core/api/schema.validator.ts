import { isRecord } from '../utils/guards';

export type DataType = 'string' | 'number' | 'boolean' | 'integer' | 'array' | 'object' | 'null';

export interface TypeAssertion {
  path: string;
  type: DataType;
  enum?: Array<string | number>;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  format?: 'date-time';
}

const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function lookup(data: unknown, dataPath: string): { found: boolean; value: unknown } {
  const tokens = dataPath.match(/[^.[\]]+|\[\d+\]/g) ?? [];
  let current: unknown = data;
  for (const token of tokens) {
    if (token.startsWith('[')) {
      const index = Number(token.slice(1, -1));
      if (!Array.isArray(current) || index >= current.length) {
        return { found: false, value: undefined };
      }
      current = current[index];
      continue;
    }
    if (!isRecord(current) || !(token in current)) {
      return { found: false, value: undefined };
    }
    current = current[token];
  }
  return { found: true, value: current };
}

function typeMatches(value: unknown, expected: DataType): boolean {
  switch (expected) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !Number.isNaN(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'null':
      return value === null;
    case 'object':
      return isRecord(value);
    default:
      return false;
  }
}

export function validateDataTypes(data: unknown, assertions: TypeAssertion[]): string[] {
  const errors: string[] = [];
  for (const assertion of assertions) {
    const lookedUp = lookup(data, assertion.path);
    if (!lookedUp.found) {
      errors.push(`${assertion.path} was not found`);
      continue;
    }
    const value = lookedUp.value;
    if (!typeMatches(value, assertion.type)) {
      errors.push(`${assertion.path} expected ${assertion.type} but received ${JSON.stringify(value)}`);
      continue;
    }
    if (assertion.enum && !assertion.enum.includes(value as string | number)) {
      errors.push(`${assertion.path} expected one of ${assertion.enum.join(', ')}`);
    }
    if (typeof value === 'number') {
      if (assertion.minimum !== undefined && value < assertion.minimum) {
        errors.push(`${assertion.path} expected >= ${assertion.minimum}`);
      }
      if (assertion.maximum !== undefined && value > assertion.maximum) {
        errors.push(`${assertion.path} expected <= ${assertion.maximum}`);
      }
    }
    if (typeof value === 'string' && assertion.minLength !== undefined && value.length < assertion.minLength) {
      errors.push(`${assertion.path} expected minLength ${assertion.minLength}`);
    }
    if (assertion.format === 'date-time' && (typeof value !== 'string' || !DATE_TIME.test(value))) {
      errors.push(`${assertion.path} expected an ISO-8601 date-time`);
    }
  }
  return errors;
}
