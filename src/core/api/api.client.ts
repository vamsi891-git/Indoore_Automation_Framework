import { APIRequestContext } from '@playwright/test';
import { ZodType } from 'zod';
import { readSecret, type AppProfile, type EnvironmentConfig } from '../config/config.loader';
import { logger } from '../utils/logger';
import { ApiError } from './api.error';
import { loginSchema, type LoginResponse } from './models';

export interface ApiRequestOptions {
  params?: Record<string, string>;
  query?: Record<string, string | number | boolean>;
  data?: unknown;
  headers?: Record<string, string>;
  expectedStatus?: number;
  failOnStatus?: boolean;
}

export interface ApiResult<T> {
  status: number;
  body: T;
  durationMs: number;
  contentType: string;
  requestHeaders: Record<string, string>;
}

export class ApiClient {
  private token: string | undefined;

  constructor(
    private readonly request: APIRequestContext,
    private readonly app: AppProfile,
    private readonly env: EnvironmentConfig,
  ) {}

  async authenticate(credentials: { email: string; password: string }): Promise<ApiResult<LoginResponse>> {
    const result = await this.post<unknown>('login', { data: credentials, expectedStatus: 200 });
    const body = loginSchema.parse(result.body);
    this.token = body.data.accessToken;
    return { ...result, body };
  }

  get<T = unknown>(endpoint: string, options?: ApiRequestOptions): Promise<ApiResult<T>> {
    return this.send<T>('GET', endpoint, options);
  }

  post<T = unknown>(endpoint: string, options?: ApiRequestOptions): Promise<ApiResult<T>> {
    return this.send<T>('POST', endpoint, options);
  }

  async getParsed<T>(endpoint: string, schema: ZodType<T>, options?: ApiRequestOptions): Promise<T> {
    const result = await this.get(endpoint, options);
    return schema.parse(result.body);
  }

  private async send<T>(method: string, endpoint: string, options: ApiRequestOptions = {}): Promise<ApiResult<T>> {
    const url = this.resolve(endpoint, options);
    const headers = this.headers(options);
    const started = Date.now();
    const response = await this.request.fetch(url, {
      method,
      headers,
      data: options.data,
      timeout: this.env.timeouts.api,
      failOnStatusCode: false,
    });
    const durationMs = Date.now() - started;
    const text = await response.text();
    let body: unknown = text;
    const contentType = response.headers()['content-type'] ?? '';
    if (contentType.includes('application/json')) {
      try {
        body = text ? (JSON.parse(text) as unknown) : null;
      } catch {
        throw new ApiError(`Response is not valid JSON from ${method} ${url}`, response.status(), text, url);
      }
    }

    logger.debug(`${method} ${url} -> ${response.status()} ${durationMs}ms`);
    const result: ApiResult<T> = {
      status: response.status(),
      body: body as T,
      durationMs,
      contentType,
      requestHeaders: headers,
    };
    this.assertStatus(result, url, method, options);
    return result;
  }

  private headers(options: ApiRequestOptions): Record<string, string> {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(this.app.headers)) {
      if (value !== '') {
        headers[key] = value;
      }
    }
    if (options.data !== undefined) {
      headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
    }
    if (this.token) {
      headers.Authorization = `${this.app.auth.tokenScheme} ${this.token}`;
    }
    const apiKey = readSecret(this.app, 'apiKey');
    if (apiKey) {
      headers[this.app.auth.apiKeyHeader] = apiKey;
    }
    return { ...headers, ...options.headers };
  }

  private resolve(endpoint: string, options: ApiRequestOptions): string {
    let route = this.app.endpoints[endpoint];
    if (!route) {
      throw new Error(
        `Unknown endpoint '${endpoint}' in app '${this.app.id}'. Available: ${Object.keys(this.app.endpoints).join(', ')}`,
      );
    }
    for (const [key, value] of Object.entries(options.params ?? {})) {
      route = route.replaceAll(`{${key}}`, encodeURIComponent(value));
    }
    if (route.includes('{')) {
      throw new Error(`Unresolved path params in endpoint '${endpoint}': ${route}`);
    }
    route = this.stripPrefix(route);

    const base = this.env.apiBaseUrl.endsWith('/') ? this.env.apiBaseUrl : `${this.env.apiBaseUrl}/`;
    const url = new URL(route.replace(/^\/+/, ''), base);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private stripPrefix(route: string): string {
    const prefix = (this.env.stripPathPrefix ?? '').replace(/^\/+|\/+$/g, '');
    if (!prefix) {
      return route;
    }
    if (route === prefix) {
      return '';
    }
    if (route.startsWith(`${prefix}/`)) {
      return route.slice(prefix.length + 1);
    }
    return route;
  }

  private assertStatus<T>(result: ApiResult<T>, url: string, method: string, options: ApiRequestOptions): void {
    const preview = JSON.stringify(result.body).slice(0, 500);
    if (options.expectedStatus !== undefined && result.status !== options.expectedStatus) {
      throw new ApiError(
        `${method} ${url} expected status ${options.expectedStatus} but received ${result.status}: ${preview}`,
        result.status,
        result.body,
        url,
      );
    }
    if (options.expectedStatus === undefined && result.status >= 400 && options.failOnStatus !== false) {
      throw new ApiError(`${method} ${url} failed with status ${result.status}: ${preview}`, result.status, result.body, url);
    }
  }
}
