import fs from 'fs';
import path from 'path';
import { resolvePlaceholders } from '../config/placeholders';
import type { ChartsFile, UserRecord } from './dataset.types';

export class DataStore {
  private readonly cache = new Map<string, unknown>();

  constructor(private readonly root: string) {}

  read<T>(relativePath: string): T {
    const cached = this.cache.get(relativePath);
    if (cached !== undefined) {
      return cached as T;
    }

    const fullPath = path.resolve(this.root, relativePath);
    const relative = path.relative(this.root, fullPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Data path escapes the data directory: ${relativePath}`);
    }
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Data file not found: ${relativePath}`);
    }

    const parsed = resolvePlaceholders(JSON.parse(fs.readFileSync(fullPath, 'utf8')) as unknown);
    this.cache.set(relativePath, parsed);
    return parsed as T;
  }

  user(name: string): UserRecord {
    return this.record('auth/users.json', name);
  }

  invalidLogin(name: string): UserRecord {
    return this.record('auth/invalid-logins.json', name);
  }

  private record(relativePath: string, name: string): UserRecord {
    const records = this.read<Record<string, UserRecord>>(relativePath);
    const record = records[name];
    if (!record) {
      throw new Error(`Unknown record '${name}' in ${relativePath}. Available: ${Object.keys(records).join(', ')}`);
    }
    return record;
  }

  charts(): ChartsFile {
    return this.read<ChartsFile>('dashboard/charts.json');
  }
}
