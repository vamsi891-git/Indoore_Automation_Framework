import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { ZodType } from 'zod';
import { resolvePlaceholders } from './placeholders';
import {
  appSchema,
  environmentSchema,
  manifestSchema,
  type AppProfile,
  type EnvironmentConfig,
} from './config.schema';

export type { AppProfile, BrowserName, EnvironmentConfig } from './config.schema';
export { readSecret } from './config.schema';

export const projectRoot = process.cwd();
const configRoot = path.join(projectRoot, 'config');

export interface LoadedConfig {
  envName: string;
  appId: string;
  env: EnvironmentConfig;
  app: AppProfile;
}

let cached: LoadedConfig | undefined;

function readJson(filePath: string): unknown {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Config file not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
}

function parseConfig<T>(schema: ZodType<T>, value: unknown, label: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Invalid ${label}:\n${parsed.error.toString()}`);
  }
  return parsed.data;
}

function isRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return { ...(value as Record<string, unknown>) };
}

export function loadConfig(): LoadedConfig {
  if (cached) {
    return cached;
  }

  dotenv.config({ path: path.join(projectRoot, '.env') });

  const manifest = parseConfig(
    manifestSchema,
    readJson(path.join(configRoot, 'manifest.json')),
    'config/manifest.json',
  );

  const envName = process.env.ENV || manifest.defaultEnv;
  const appId = process.env.APP_ID || manifest.defaultApp;
  const envPath = manifest.environments[envName];
  const appPath = manifest.apps[appId];

  if (!envPath) {
    throw new Error(
      `Unknown environment '${envName}'. Available: ${Object.keys(manifest.environments).join(', ')}`,
    );
  }
  if (!appPath) {
    throw new Error(`Unknown app '${appId}'. Available: ${Object.keys(manifest.apps).join(', ')}`);
  }

  const envObject = isRecord(
    resolvePlaceholders(readJson(path.join(configRoot, envPath))),
    `environment '${envName}'`,
  );
  if (process.env.BASE_URL) {
    envObject.baseUrl = process.env.BASE_URL;
  }
  if (process.env.API_BASE_URL) {
    envObject.apiBaseUrl = process.env.API_BASE_URL;
  }

  cached = {
    envName,
    appId,
    env: parseConfig(environmentSchema, envObject, `environment '${envName}'`),
    app: parseConfig(
      appSchema,
      resolvePlaceholders(readJson(path.join(configRoot, appPath))),
      `app '${appId}'`,
    ),
  };
  return cached;
}

export function schemaDirectory(app: AppProfile = loadConfig().app): string {
  return path.resolve(configRoot, app.schemaDir);
}
