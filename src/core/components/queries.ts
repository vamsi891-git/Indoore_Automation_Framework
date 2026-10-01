import { type Locator, type Page } from '@playwright/test';
import type { ElementQuery } from '../config/config.schema';

export type { ElementQuery };

type Scope = Page | Locator;
type Role = Parameters<Page['getByRole']>[0];

export async function findByRole(
  scope: Scope,
  role: string,
  options?: { name?: string; exact?: boolean; level?: number },
): Promise<Locator> {
  const locator = scope.getByRole(role as Role, {
    ...(options?.name !== undefined ? { name: options.name, exact: options.exact ?? true } : {}),
    ...(options?.level !== undefined ? { level: options.level } : {}),
  });
  await locator.waitFor();
  return locator;
}

export async function findByLabelText(
  scope: Scope,
  label: string,
  options?: { exact?: boolean },
): Promise<Locator> {
  const locator = scope.getByLabel(label, { exact: options?.exact ?? true });
  await locator.waitFor();
  return locator;
}

export async function findByText(
  scope: Scope,
  text: string,
  options?: { exact?: boolean },
): Promise<Locator> {
  const locator = scope.getByText(text, { exact: options?.exact ?? true });
  await locator.waitFor();
  return locator;
}

export async function findByTestId(scope: Scope, testId: string): Promise<Locator> {
  const locator = scope.getByTestId(testId);
  await locator.waitFor();
  return locator;
}

export async function find(scope: Scope, query: ElementQuery): Promise<Locator> {
  switch (query.method) {
    case 'findByRole':
      return findByRole(scope, query.role, { name: query.name, exact: query.exact, level: query.level });
    case 'findByLabelText':
      return findByLabelText(scope, query.label, { exact: query.exact });
    case 'findByText':
      return findByText(scope, query.text, { exact: query.exact });
    case 'findByTestId':
      return findByTestId(scope, query.testId);
  }
}

export function labelText(query: ElementQuery, key: string): string {
  if (query.method !== 'findByLabelText') {
    throw new Error(`Element '${key}' is not located with findByLabelText`);
  }
  return query.label;
}

export function roleName(query: ElementQuery, key: string): string {
  if (query.method !== 'findByRole' || !query.name) {
    throw new Error(`Element '${key}' needs findByRole with an accessible name`);
  }
  return query.name;
}
