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

  it('reports explicit development compatibility readiness without credentials', async () => {
    const { runtimeReadiness, startRuntimeIdentity } = await import('../src/runtime-identity');
    startRuntimeIdentity();
    await expect(runtimeReadiness()).resolves.toMatchObject({
      processRunning: true,
      manifestVerified: true,
      activeAuthorization: true,
      identityPaired: false,
      mode: 'development',
    });
  });
});
