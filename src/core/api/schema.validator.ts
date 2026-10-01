import fs from 'fs';
import path from 'path';
import Ajv, { ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import { schemaDirectory } from '../config/config.loader';
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

export interface SchemaValidationResult {
  ok: boolean;
  errors: string[];
}

const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map(
    (error) => `${error.instancePath || '/'} [${error.keyword}] ${error.message ?? ''}`.trim(),
  );
}

function withoutMeta(schema: Record<string, unknown>): Record<string, unknown> {
  const comparable: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key !== '$id' && key !== '$schema') {
      comparable[key] = value;
    }
  }
  return comparable;
}

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

export class SchemaValidator {
  private readonly ajv = new Ajv({ allErrors: true, strict: true });
  private readonly rawSchemas = new Map<string, Record<string, unknown>>();

  constructor(directory = schemaDirectory()) {
    addFormats(this.ajv);
    if (!fs.existsSync(directory)) {
      throw new Error(`Schema directory not found: ${directory}. Set schemaDir in the app profile.`);
    }

    const files = fs.readdirSync(directory).filter((file) => file.endsWith('.schema.json'));
    if (files.length === 0) {
      throw new Error(`No schemas found in ${directory}`);
    }

    for (const file of files) {
      const raw = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')) as unknown;
      if (!isRecord(raw) || typeof raw.$id !== 'string') {
        throw new Error(`${file} must be an object with a string $id`);
      }
      const expectedId = file.replace(/\.schema\.json$/, '');
      if (raw.$id !== expectedId) {
        throw new Error(`${file} $id must be '${expectedId}'`);
      }
      this.rawSchemas.set(expectedId, raw);
      this.ajv.addSchema(raw);
    }

    for (const name of this.rawSchemas.keys()) {
      if (!this.ajv.getSchema(name)) {
        throw new Error(`Failed to compile schema '${name}'`);
      }
    }
    this.assertListUsesItemContract('dtr', 'dtr-list');
  }

  raw(name: string): Record<string, unknown> {
    const schema = this.rawSchemas.get(name);
    if (!schema) {
      throw new Error(`Unknown schema '${name}'. Available: ${this.names().join(', ')}`);
    }
    return schema;
  }

  names(): string[] {
    return [...this.rawSchemas.keys()].sort();
  }

  validate(name: string, data: unknown): SchemaValidationResult {
    const validate = this.ajv.getSchema(name);
    if (!validate) {
      throw new Error(`Unknown schema '${name}'. Available: ${this.names().join(', ')}`);
    }
    const ok = Boolean(validate(data));
    return { ok, errors: ok ? [] : formatAjvErrors(validate.errors) };
  }

  private assertListUsesItemContract(itemId: string, listId: string): void {
    const item = this.rawSchemas.get(itemId);
    const list = this.rawSchemas.get(listId);
    if (!item || !list) {
      return;
    }
    const properties = list.properties;
    if (!isRecord(properties) || !isRecord(properties.items)) {
      throw new Error(`${listId} schema is missing properties.items`);
    }
    const items = properties.items.items;
    if (JSON.stringify(items) !== JSON.stringify(withoutMeta(item))) {
      throw new Error(`${listId} items schema must match ${itemId}.schema.json (excluding $id and $schema)`);
    }
  }
}
