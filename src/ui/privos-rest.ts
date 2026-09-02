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

/**
 * A hub failure that carried a machine-readable code.
 *
 * The message is what a person reads; `code` is what the app branches on. They
 * are kept apart on purpose — matching prose would break the moment the copy
 * changes, and the hub's recoverable failures (a bot key the sandbox no longer
 * holds, an automatic sync already spent) are exactly the ones an app should
 * react to rather than merely display.
 */
export class PrivosRestError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'PrivosRestError';
  }
}

/**
 * Surface the REAL failure. Only a genuine optional-scope denial (a 403 that `restCall` turns
 * into `OptionalFeatureUnavailableError`) gets the shared "feature disabled" copy; every other
 * failure shows the endpoint's own message. Prefer this over `safeFeatureError` on any owner/admin
 * or business-rule path — `safeFeatureError` rewrites any message merely containing "permission"
 * (e.g. "Only a room owner or admin may set additionalReaders/additionalEditors") into the generic
 * copy, which hides the actual cause and the failing step.
 */
export function describeFeatureError(error: unknown, fallback: string): string {
  if (error instanceof OptionalFeatureUnavailableError) return error.message;
  const message = error instanceof Error ? error.message : String(error || '');
  return message || fallback;
}

export function safeFeatureError(error: unknown, fallback: string): string {
  if (error instanceof OptionalFeatureUnavailableError) return error.message;
  const message = error instanceof Error ? error.message : String(error || '');
  // "unauthorized" is in the list because the Hub words its room-role refusals
  // that way ("error-unauthorized"); without it a permission problem reached the
  // user as a bare generic failure with nothing actionable in it.
  if (/permission|forbidden|unauthori[sz]ed|scope|not.granted|\b403\b/i.test(message)) {
    return new OptionalFeatureUnavailableError().message;
  }
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
  // Meteor's API.v1.failure(message) convention: the real reason travels in
  // `body.error`. Surfacing it lets callers distinguish failure modes (e.g. an
  // unprovisioned bot vs. a task already bound to a different executor)
  // instead of a bare status code; safeFeatureError still strips it down to a
  // generic message when it looks permission-related.
  const detail = typeof body?.error === 'string' ? body.error : undefined;
  const code = typeof body?.errorType === 'string' ? body.errorType : undefined;
  if (res?.statusCode && res.statusCode >= 400) {
    if (res.statusCode === 403) throw new OptionalFeatureUnavailableError();
    throw new PrivosRestError(detail || `Request failed (${res.statusCode})`, res.statusCode, code);
  }
  if (body && body.success === false) {
    throw new PrivosRestError(detail || 'Request failed', res?.statusCode, code);
  }
  return body as T;
}
