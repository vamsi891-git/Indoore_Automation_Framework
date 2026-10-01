import { expect } from '@playwright/test';
import { SchemaValidator, TypeAssertion, validateDataTypes } from './schema.validator';

let validator: SchemaValidator | undefined;

export function getSchemaValidator(): SchemaValidator {
  if (!validator) {
    validator = new SchemaValidator();
  }
  return validator;
}

expect.extend({
  toMatchJsonSchema(received: unknown, schemaName: string) {
    const result = getSchemaValidator().validate(schemaName, received);
    return {
      pass: result.ok,
      message: () =>
        result.ok
          ? `expected value not to match schema '${schemaName}'`
          : `schema '${schemaName}' failed:\n${result.errors.join('\n')}`,
    };
  },
  toMatchDataTypes(received: unknown, assertions: TypeAssertion[]) {
    const errors = validateDataTypes(received, assertions);
    return {
      pass: errors.length === 0,
      message: () =>
        errors.length === 0
          ? 'expected value not to match data type assertions'
          : `data type assertions failed:\n${errors.join('\n')}`,
    };
  },
});

declare global {
  namespace PlaywrightTest {
    interface Matchers<R, T> {
      toMatchJsonSchema(schemaName: string): R;
      toMatchDataTypes(assertions: TypeAssertion[]): R;
    }
  }
}
