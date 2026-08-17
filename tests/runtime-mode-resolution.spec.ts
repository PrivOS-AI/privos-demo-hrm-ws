import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	saveStandaloneIdentity,
	standaloneHubFingerprint,
	type RuntimeDispatchTrustV3,
	type StandaloneIdentityV2,
} from '@privos_ai/app-server';

/**
 * `resolveRuntimeMode()` itself already has upstream unit coverage (phase 4,
 * 178 tests). These tests prove THIS app's wiring reacts correctly: it
 * resolves the mode this SDK function picks, and a fatal `RuntimeModeError`
 * surfaces as a rejected import rather than a silent fallback.
 */

let workDir: string | undefined;

function tempPath(name: string): string {
	workDir ??= fs.mkdtempSync(path.join(os.tmpdir(), 'privos-runtime-mode-'));
	return path.join(workDir, name);
}

/** A structurally valid `RuntimeDispatchTrustV3` — real EC key, real hash-shaped fields. */
function buildTrust(): RuntimeDispatchTrustV3 {
	const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
	const jwk = pair.publicKey.export({ format: 'jwk' }) as { crv: string; kty: string; x: string; y: string };
	const hubPublicJwk = { crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y };
	const hubKid = crypto
		.createHash('sha256')
		.update(JSON.stringify(hubPublicJwk))
		.digest('base64url');
	return {
		hubKid,
		hubPublicJwk,
		affinity: {
			workspaceId: 'workspace-standalone',
			deploymentId: 'deployment-standalone',
			mcpAppId: 'ai.privos.mcp-app-demo',
			executionMode: 'PUBLISHER_HOSTED',
			generationId: 'generation-standalone',
			generationNumber: 1,
			runtimeInstallationId: 'installation-standalone',
			manifestDigest: `sha256:${'a'.repeat(64)}`,
			resourceManifestHash: 'B'.repeat(43),
		},
	};
}

afterEach(() => {
	delete process.env.NODE_ENV;
	delete process.env.PRIVOS_WORKLOAD_SOCKET;
	delete process.env.PRIVOS_STANDALONE_IDENTITY_FILE;
	vi.restoreAllMocks();
	vi.resetModules();
	if (workDir) {
		fs.rmSync(workDir, { recursive: true, force: true });
		workDir = undefined;
	}
});

describe('runtime mode resolution', () => {
	it('resolves development when neither a workload socket nor a standalone identity file exists', async () => {
		process.env.PRIVOS_WORKLOAD_SOCKET = tempPath('no-socket.sock');
		process.env.PRIVOS_STANDALONE_IDENTITY_FILE = tempPath('no-identity.json');

		const { runtimeMode } = await import('../src/runtime-identity');
		expect(runtimeMode()).toBe('development');
	});

	it('refuses to guess when both a workload socket and a standalone identity file are present', async () => {
		const socketPath = tempPath('identity.sock');
		const identityPath = tempPath('privos-standalone-identity.json');
		fs.writeFileSync(socketPath, '');
		fs.writeFileSync(identityPath, '{}');
		process.env.PRIVOS_WORKLOAD_SOCKET = socketPath;
		process.env.PRIVOS_STANDALONE_IDENTITY_FILE = identityPath;

		await expect(import('../src/runtime-identity')).rejects.toMatchObject({ code: 'AMBIGUOUS_RUNTIME_IDENTITY' });
	});

	it('refuses to boot in production with no managed or standalone identity', async () => {
		process.env.NODE_ENV = 'production';
		process.env.PRIVOS_WORKLOAD_SOCKET = tempPath('no-socket.sock');
		process.env.PRIVOS_STANDALONE_IDENTITY_FILE = tempPath('no-identity.json');

		await expect(import('../src/runtime-identity')).rejects.toMatchObject({ code: 'PRODUCTION_WITHOUT_IDENTITY' });
	});

	it('resolves standalone-production from a paired identity file and reports live readiness', async () => {
		const identityPath = tempPath('privos-standalone-identity.json');
		process.env.PRIVOS_WORKLOAD_SOCKET = tempPath('no-socket.sock');
		process.env.PRIVOS_STANDALONE_IDENTITY_FILE = identityPath;

		const trust = buildTrust();
		const identity: StandaloneIdentityV2 = {
			pairingVersion: 2,
			// Reserved/unassigned port: connection refuses immediately, never hangs the test.
			relayUrl: 'http://127.0.0.1:1',
			clientId: 'client-standalone',
			clientSecret: 'secret-standalone',
			trust,
			fingerprint: standaloneHubFingerprint(trust.hubKid),
			pairedAt: Date.now(),
		};
		await saveStandaloneIdentity(identity, { filePath: identityPath });

		const { runtimeMode, startRuntimeIdentity, runtimeReadiness, resolveHubOrigin, stopRuntimeIdentity } =
			await import('../src/runtime-identity');
		try {
			expect(runtimeMode()).toBe('standalone-production');
			startRuntimeIdentity();

			const readiness = await runtimeReadiness();
			expect(readiness).toMatchObject({
				processRunning: true,
				mode: 'standalone-production',
				identityPaired: true,
				activeAuthorization: false,
				reason: 'RELAY_NOT_AUTHENTICATED',
			});
			await expect(resolveHubOrigin()).resolves.toBe('http://127.0.0.1:1');
		} finally {
			stopRuntimeIdentity();
		}
	});
});
