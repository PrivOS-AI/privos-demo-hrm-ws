/**
 * Thin wrapper around `app.rest()` — the REST-first way to talk to the hub.
 *
 * `app.rest()` resolves `{ statusCode, body }` where `body` is the hub's
 * API.v1 payload (e.g. `{ success: true, lists: [...] }`). This helper unwraps
 * that, throwing on HTTP errors or `success: false` so callers can `try/catch`
 * the same way they did with the legacy `callServerTool` tools.
 *
 * Every call runs as the logged-in user and is gated server-side by the app's
 * granted scopes (declared in package.json `scopes`), so no bespoke tools needed.
 */
import type { McpApp, RestRequestParams } from '@privos/app-react';

export async function restCall<T = any>(
  app: McpApp,
  method: RestRequestParams['method'],
  path: string,
  opts?: { query?: Record<string, string | number | boolean>; body?: any; timeoutMs?: number },
): Promise<T> {
  const res = await app.rest({ method, path, query: opts?.query, body: opts?.body, timeoutMs: opts?.timeoutMs });
  const body: any = res?.body ?? res;
  if (res?.statusCode && res.statusCode >= 400) {
    throw new Error(body?.error || body?.message || `Request failed (${res.statusCode})`);
  }
  if (body && body.success === false) {
    throw new Error(body.error || body.message || 'Request failed');
  }
  return body as T;
}
