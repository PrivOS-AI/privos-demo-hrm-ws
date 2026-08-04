import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * A node that runs this app as an App Library generation attests the
 * generation. These tests stand up that exact broker and Hub so readiness and
 * dispatch are proven against the real production contract, not a stub of it.
 */

const APPROVAL_RECEIPT_HASH = 'D'.repeat(43);
const GENERATION = {
  clusterId: 'cluster-1',
  deploymentId: 'deployment-1',
  generationId: 'generation-1',
  generationNumber: 3,
  manifestDigest: `sha256:${'a'.repeat(64)}`,
  resourceManifestHash: 'B'.repeat(43),
  runtimeResourceInventoryHash: 'C'.repeat(43),
};
const WORKSPACE_ID = 'workspace-1';
const RUNTIME_INSTALLATION_ID = 'runtime-installation-1';
const MCP_APP_ID = 'mcp-app-1';
const AUTHORIZATION_EPOCH = 7;

const hubPair = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const hubPublicJwk = hubPair.publicKey.export({ format: 'jwk' });
const hubKid = crypto
  .createHash('sha256')
  .update(JSON.stringify({ crv: hubPublicJwk.crv, kty: hubPublicJwk.kty, x: hubPublicJwk.x, y: hubPublicJwk.y }))
  .digest('base64url');

const canonicalJson = (value: unknown): string => {
  const canonicalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonicalize);
    if (input && typeof input === 'object') {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .filter(([, child]) => child !== undefined)
          .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
          .map(([key, child]) => [key, canonicalize(child)]),
      );
    }
    return input;
  };
  return JSON.stringify(canonicalize(value));
};

const signWithHub = (header: Record<string, unknown>, payload: Record<string, unknown>): string => {
  const encodedHeader = Buffer.from(canonicalJson(header), 'utf8').toString('base64url');
  const encodedPayload = Buffer.from(canonicalJson(payload), 'utf8').toString('base64url');
  const signature = crypto
    .sign('sha256', Buffer.from(`${encodedHeader}.${encodedPayload}`, 'utf8'), {
      key: hubPair.privateKey,
      dsaEncoding: 'ieee-p1363',
    })
    .toString('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
};

const thumbprint = (jwk: crypto.JsonWebKey): string =>
  crypto.createHash('sha256').update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })).digest('base64url');

type Harness = {
  socketPath: string;
  hubOrigin: string;
  close: () => Promise<void>;
};

/** The broker socket and Hub endpoints a cluster node exposes to the container. */
async function startNodeHarness(): Promise<Harness> {
  const hub = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.url?.endsWith('mcp-workload.ready')) return res.end(JSON.stringify({ status: 'active' }));
      return res.end(
        JSON.stringify({
          access_token: `token-${'x'.repeat(32)}`,
          token_type: 'DPoP',
          expires_in: 300,
          scope: 'basic:information',
        }),
      );
    });
  });
  await new Promise<void>((resolve) => hub.listen(0, '127.0.0.1', resolve));
  const hubPort = (hub.address() as net.AddressInfo).port;
  const hubOrigin = `http://127.0.0.1:${hubPort}`;

  const socketPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'privos-broker-')), 'identity.sock');
  const broker = net.createServer((socket) => {
    socket.setEncoding('utf8');
    socket.once('data', (raw) => {
      const request = JSON.parse(String(raw).trim()) as { publicJwk: crypto.JsonWebKey; nonce: string };
      const issuedAt = Math.floor(Date.now() / 1000);
      const attestation = signWithHub(
        { alg: 'ES256', kid: 'node-kid', privos_protocol: 3, typ: 'privos-node-attestation+jws' },
        {
          protocolVersion: 3,
          type: 'node-workload-attestation',
          iss: `urn:privos:cluster-node:${GENERATION.clusterId}:node-1`,
          aud: 'privos-hub-api',
          iat: issuedAt,
          exp: issuedAt + 45,
          jti: crypto.randomUUID(),
          clusterId: GENERATION.clusterId,
          nodeId: 'node-1',
          workspaceId: WORKSPACE_ID,
          deploymentId: GENERATION.deploymentId,
          generationId: GENERATION.generationId,
          generationNumber: GENERATION.generationNumber,
          runtimeInstallationId: RUNTIME_INSTALLATION_ID,
          mcpAppId: MCP_APP_ID,
          replicaId: 'replica-1',
          containerId: 'container-1',
          imageDigest: `sha256:${'b'.repeat(64)}`,
          manifestDigest: GENERATION.manifestDigest,
          approvalReceiptHash: APPROVAL_RECEIPT_HASH,
          authorizationEpoch: AUTHORIZATION_EPOCH,
          resourceManifestHash: GENERATION.resourceManifestHash,
          runtimeResourceInventoryHash: GENERATION.runtimeResourceInventoryHash,
          dpopJkt: thumbprint(request.publicJwk),
          nonce: request.nonce,
        },
      );
      socket.end(`${JSON.stringify({ ok: true, attestation, hubOrigin, hubKid, hubPublicJwk })}\n`);
    });
  });
  await new Promise<void>((resolve) => broker.listen(socketPath, resolve));

  return {
    socketPath,
    hubOrigin,
    close: async () => {
      await new Promise<void>((resolve) => broker.close(() => resolve()));
      await new Promise<void>((resolve) => hub.close(() => resolve()));
      fs.rmSync(path.dirname(socketPath), { recursive: true, force: true });
    },
  };
}

function clusterDispatchAssertion(body: unknown, overrides: Record<string, unknown> = {}): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  return signWithHub(
    { alg: 'ES256', kid: hubKid, privos_protocol: 3, typ: 'privos-hub-dispatch+jws' },
    {
      protocolVersion: 3,
      type: 'hub-dispatch-assertion',
      iss: `urn:privos:hub:${GENERATION.deploymentId}`,
      aud: 'privos-mcp-app',
      jti: crypto.randomUUID(),
      nonce: crypto.randomBytes(24).toString('base64url'),
      iat: issuedAt,
      exp: issuedAt + 30,
      clusterId: GENERATION.clusterId,
      workspaceId: WORKSPACE_ID,
      deploymentId: GENERATION.deploymentId,
      generationId: GENERATION.generationId,
      generationNumber: GENERATION.generationNumber,
      runtimeInstallationId: RUNTIME_INSTALLATION_ID,
      mcpAppId: MCP_APP_ID,
      clusterAppId: 'cluster-app-1',
      htm: 'POST',
      htu: '/mcp',
      bodyDigest: crypto.createHash('sha256').update(canonicalJson(body), 'utf8').digest('base64url'),
      manifestDigest: GENERATION.manifestDigest,
      resourceManifestHash: GENERATION.resourceManifestHash,
      runtimeResourceInventoryHash: GENERATION.runtimeResourceInventoryHash,
      runtimeApprovalReceiptHash: APPROVAL_RECEIPT_HASH,
      runtimeGrantEpoch: AUTHORIZATION_EPOCH,
      authorizationContext: 'workspace',
      ...overrides,
    },
  );
}

let harness: Harness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
  delete process.env.PRIVOS_RUNTIME_MODE;
  delete process.env.NODE_ENV;
  delete process.env.PRIVOS_WORKLOAD_SOCKET;
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('App Library generation runtime', () => {
  it('reports ready once it pairs with a node that attested a generation', async () => {
    harness = await startNodeHarness();
    process.env.PRIVOS_RUNTIME_MODE = 'production';
    process.env.PRIVOS_WORKLOAD_SOCKET = harness.socketPath;

    const { getEffectiveCapabilities, runtimeReadiness } = await import('../src/runtime-identity');
    await getEffectiveCapabilities();

    expect(runtimeReadiness()).toMatchObject({
      processRunning: true,
      manifestVerified: true,
      identityPaired: true,
      activeAuthorization: true,
      mode: 'production-workload',
      grantEpoch: AUTHORIZATION_EPOCH,
    });
    expect(runtimeReadiness().reason).toBeUndefined();
  });

  it('accepts a dispatch the Hub routed through the cluster', async () => {
    harness = await startNodeHarness();
    process.env.PRIVOS_RUNTIME_MODE = 'production';
    process.env.PRIVOS_WORKLOAD_SOCKET = harness.socketPath;

    const { getEffectiveCapabilities, verifyInboundDispatch } = await import('../src/runtime-identity');
    await getEffectiveCapabilities();
    const body = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} };

    await expect(verifyInboundDispatch(body, clusterDispatchAssertion(body))).resolves.toMatchObject({
      jti: expect.any(String),
    });
  });

  it('refuses a dispatch bound to a superseded authorization epoch', async () => {
    harness = await startNodeHarness();
    process.env.PRIVOS_RUNTIME_MODE = 'production';
    process.env.PRIVOS_WORKLOAD_SOCKET = harness.socketPath;

    const { getEffectiveCapabilities, verifyInboundDispatch } = await import('../src/runtime-identity');
    await getEffectiveCapabilities();
    const body = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} };

    await expect(
      verifyInboundDispatch(body, clusterDispatchAssertion(body, { runtimeGrantEpoch: AUTHORIZATION_EPOCH - 1 })),
    ).rejects.toThrow('dispatch_assertion_binding_mismatch');
  });
});
