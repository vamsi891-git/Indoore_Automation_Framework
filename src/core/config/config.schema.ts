import { z } from 'zod';

export const browserSchema = z.enum(['chromium', 'firefox', 'webkit']);
export type BrowserName = z.infer<typeof browserSchema>;

const roleQuerySchema = z
  .object({
    method: z.literal('findByRole'),
    role: z.string().min(1),
    name: z.string().min(1).optional(),
    level: z.number().int().positive().optional(),
    exact: z.boolean().optional(),
  })
  .strict();

const labelQuerySchema = z
  .object({
    method: z.literal('findByLabelText'),
    label: z.string().min(1),
    exact: z.boolean().optional(),
  })
  .strict();

const textQuerySchema = z
  .object({
    method: z.literal('findByText'),
    text: z.string().min(1),
    exact: z.boolean().optional(),
  })
  .strict();

const testIdQuerySchema = z
  .object({
    method: z.literal('findByTestId'),
    testId: z.string().min(1),
  })
  .strict();

export const elementQuerySchema = z.discriminatedUnion('method', [
  roleQuerySchema,
  labelQuerySchema,
  textQuerySchema,
  testIdQuerySchema,
]);

export type ElementQuery = z.infer<typeof elementQuerySchema>;

export const manifestSchema = z
  .object({
    defaultEnv: z.string().min(1),
    defaultApp: z.string().min(1),
    environments: z.record(z.string().min(1)),
    apps: z.record(z.string().min(1)),
  })
  .strict();

export const environmentSchema = z
  .object({
    name: z.string().min(1),
    baseUrl: z.string().url(),
    apiBaseUrl: z.string().url(),
    stripPathPrefix: z.string().min(1).optional(),
    timeouts: z
      .object({
        test: z.number().int().positive(),
        action: z.number().int().positive(),
        navigation: z.number().int().positive(),
        expect: z.number().int().positive(),
        api: z.number().int().positive(),
      })
      .strict(),
    retries: z
      .object({
        local: z.number().int().nonnegative(),
        ci: z.number().int().nonnegative(),
      })
      .strict(),
    workers: z
      .object({
        local: z.number().int().nonnegative(),
        ci: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export const appSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    schemaDir: z.string().min(1),
    routes: z.record(z.string().min(1)),
    endpoints: z.record(z.string().min(1)),
    keys: z.record(z.string().min(1)),
    headers: z.record(z.string()),
    auth: z
      .object({
        apiKeyHeader: z.string().min(1),
        tokenScheme: z.string().min(1),
      })
      .strict(),
    storage: z
      .object({
        authToken: z.string().min(1),
      })
      .strict(),
    features: z.record(z.boolean()),
    ui: z
      .object({
        elements: z.record(elementQuerySchema),
      })
      .strict(),
    execution: z
      .object({
        webBrowsers: z.array(browserSchema).min(1),
        e2eBrowsers: z.array(browserSchema).min(1),
      })
      .strict(),
  })
  .strict();

export type EnvironmentConfig = z.infer<typeof environmentSchema>;
export type AppProfile = z.infer<typeof appSchema>;

export function readSecret(app: AppProfile, key: string): string | undefined {
  const envName = app.keys[key];
  if (!envName) {
    return undefined;
  }
  const value = process.env[envName];
  return value ? value : undefined;
}
