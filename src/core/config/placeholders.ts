const PLACEHOLDER = /\{\{env\.([A-Z0-9_]+)(?:\|([^}]*))?\}\}/g;

function resolveString(value: string, env: NodeJS.ProcessEnv): string {
  return value.replace(PLACEHOLDER, (_match, name: string, fallback: string | undefined) => {
    return env[name] ?? fallback ?? '';
  });
}

function walk(value: unknown, env: NodeJS.ProcessEnv): unknown {
  if (typeof value === 'string') {
    return resolveString(value, env);
  }
  if (Array.isArray(value)) {
    return value.map((item) => walk(item, env));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, walk(nested, env)]),
    );
  }
  return value;
}

/** Replaces `{{env.NAME}}` and `{{env.NAME|fallback}}` anywhere in a JSON tree. */
export function resolvePlaceholders<T>(value: T, env: NodeJS.ProcessEnv = process.env): T {
  return walk(value, env) as T;
}
