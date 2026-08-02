import { afterEach, describe, expect, it, vi } from 'vitest';

import { safeFeatureError } from '../src/ui/privos-rest';

afterEach(() => {
  delete process.env.PRIVOS_RUNTIME_MODE;
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
    process.env.PRIVOS_RUNTIME_MODE = 'development';
    const { runtimeReadiness, startRuntimeIdentity } = await import('../src/runtime-identity');
    startRuntimeIdentity();
    expect(runtimeReadiness()).toMatchObject({
      processRunning: true,
      manifestVerified: true,
      activeAuthorization: true,
      identityPaired: false,
      mode: 'development-compatibility',
    });
  });

  it('rejects a public production MCP request before invoking a handler', async () => {
    process.env.PRIVOS_RUNTIME_MODE = 'production';
    process.env.NODE_ENV = 'production';
    const { startHttpServer } = await import('../src/http-server');
    const server = startHttpServer(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    expect(address && typeof address !== 'string').toBe(true);
    const port = typeof address === 'object' && address ? address.port : 0;
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { data: { code: 'DISPATCH_ASSERTION_INVALID' } } });
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
});
