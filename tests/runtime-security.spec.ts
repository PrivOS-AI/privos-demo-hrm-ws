import { afterEach, describe, expect, it, vi } from 'vitest';

import { safeFeatureError } from '../src/ui/privos-rest';

afterEach(() => {
  delete process.env.NODE_ENV;
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('production runtime security', () => {
  it('does not reflect sensitive exception text into feature errors', () => {
    const marker = 'Bearer should-never-appear';
    expect(safeFeatureError(new Error(marker), 'The operation failed.')).toBe('The operation failed.');
    expect(safeFeatureError(new Error('403 forbidden'), 'The operation failed.')).not.toContain(marker);
  });

  // Runtime-mode resolution and per-mode readiness are now owned by the SDK
  // (`serveApp` / `resolveRuntimeMode`) and covered by the SDK suite; the demo's
  // former runtime-identity readiness path no longer exists here.
});
