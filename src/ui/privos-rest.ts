/**
 * Thin wrapper around `app.rest()` — the REST-first way to talk to the hub.
 *
 * `app.rest()` resolves `{ statusCode, body }` where `body` is the hub's
 * API.v1 payload (e.g. `{ success: true, lists: [...] }`). This helper unwraps
 * that, throwing on HTTP errors or `success: false` so callers can `try/catch`
 * the same way they did with the legacy `callServerTool` tools.
 *
 * Every call runs as the logged-in user and is gated server-side by the app's
 * exact installation grant, so no bespoke tools are needed.
 */
import type { McpApp, RestRequestParams } from '@privos_ai/app-react';

export class OptionalFeatureUnavailableError extends Error {
  readonly code = 'OPTIONAL_PERMISSION_NOT_GRANTED';

  constructor(public readonly scope?: string) {
    super('This optional feature is disabled because its permission was not granted. An administrator can enable it in app settings.');
    this.name = 'OptionalFeatureUnavailableError';
  }
}

export function safeFeatureError(error: unknown, fallback: string): string {
  if (error instanceof OptionalFeatureUnavailableError) return error.message;
  const message = error instanceof Error ? error.message : String(error || '');
  if (/permission|forbidden|scope|not.granted|\b403\b/i.test(message)) return new OptionalFeatureUnavailableError().message;
  return fallback;
}

export async function restCall<T = any>(
  app: McpApp,
  method: RestRequestParams['method'],
  path: string,
  opts?: { query?: Record<string, string | number | boolean>; body?: any; timeoutMs?: number },
): Promise<T> {
  const res = await app.rest({ method, path, query: opts?.query, body: opts?.body, timeoutMs: opts?.timeoutMs });
  const body: any = res?.body ?? res;
  if (res?.statusCode && res.statusCode >= 400) {
    if (res.statusCode === 403) throw new OptionalFeatureUnavailableError();
    throw new Error(`Request failed (${res.statusCode})`);
  }
  if (body && body.success === false) {
    throw new Error('Request failed');
  }
  return body as T;
}
