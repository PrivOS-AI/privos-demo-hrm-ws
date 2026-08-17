import {
	resolveRuntimeMode,
	type RuntimeMode,
	type VerifiedActor,
} from '@privos_ai/app-server';
import {
	WorkloadIdentityClient,
	verifyClusterDispatchAssertionV3,
	verifyDispatchAssertion,
	type EffectiveCapabilities,
	type VerifiedDispatchActor,
} from '@privos_ai/app-server/workload';
import { lintManifest } from '@privos_ai/app-server/manifest-tools';

import { createManifest } from './manifest';
import { startStandaloneProductionRelay, type StandaloneProductionRuntime } from './relay-transport';

/**
 * `resolveRuntimeMode()` picks exactly one of three ways this app talks to
 * its Hub (precedence `managed` > `standalone-production` > `development`),
 * throwing `RuntimeModeError` — a fatal boot error, never a silent pick —
 * when both a managed workload socket and a paired standalone identity file
 * are present, or when `NODE_ENV=production` and neither applies. Resolved
 * once at module load: every consumer below (`server.ts`, `http-server.ts`,
 * tests) imports this module only after the environment it needs is set.
 */
export type DemoRuntimeMode = RuntimeMode;
const mode: DemoRuntimeMode = resolveRuntimeMode().mode;

export type DemoReadiness = Readonly<{
	processRunning: true;
	manifestVerified: boolean;
	identityPaired: boolean;
	activeAuthorization: boolean;
	mode: DemoRuntimeMode;
	capabilityCount: number;
	grantEpoch?: number;
	reason?: string;
}>;

const identity = new WorkloadIdentityClient();
const manifestLint = lintManifest(createManifest());
let capabilities: EffectiveCapabilities = identity.peekEffectiveCapabilities();
let identityPaired = false;
let activeAuthorization = false;
let reason: string | undefined = manifestLint.valid ? undefined : 'MANIFEST_INVALID';
let bootstrapTimer: ReturnType<typeof setInterval> | undefined;
let standaloneRuntime: StandaloneProductionRuntime | undefined;

identity.onCapabilitiesChanged((next) => {
	capabilities = next;
	identityPaired = ['paired', 'active'].includes(next.status);
	activeAuthorization = next.status === 'active';
	reason = next.reason;
});

async function attemptManagedBootstrap(): Promise<void> {
	if (!manifestLint.valid) return;
	try {
		capabilities = await identity.getEffectiveCapabilities({ forceRefresh: !activeAuthorization });
		identityPaired = ['paired', 'active'].includes(capabilities.status);
		activeAuthorization = capabilities.status === 'active';
		reason = capabilities.reason;
		if (activeAuthorization) {
			identity.startCapabilityMonitor(30_000);
			if (bootstrapTimer) clearInterval(bootstrapTimer);
			bootstrapTimer = undefined;
		}
	} catch (error) {
		identityPaired = ['paired', 'active'].includes(identity.peekEffectiveCapabilities().status);
		activeAuthorization = false;
		reason = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'WORKLOAD_IDENTITY_PENDING';
	}
}

/**
 * Start bounded in-process reconciliation for the resolved mode. `managed`:
 * no credentials are accepted or persisted, bootstrap against the workload
 * broker. `standalone-production`: load the paired identity file (fatal if
 * missing/invalid) and connect Relay with mandatory assertion verification.
 * `development`: fully local, no reconciliation loop.
 */
export function startRuntimeIdentity(): void {
	if (mode === 'managed') {
		void attemptManagedBootstrap();
		if (!bootstrapTimer) {
			bootstrapTimer = setInterval(() => void attemptManagedBootstrap(), 10_000);
			bootstrapTimer.unref();
		}
		return;
	}
	if (mode === 'standalone-production') {
		standaloneRuntime = startStandaloneProductionRelay();
		return;
	}
	identityPaired = false;
	activeAuthorization = manifestLint.valid;
	reason = manifestLint.valid ? undefined : 'MANIFEST_INVALID';
}

export function runtimeMode(): DemoRuntimeMode {
	return mode;
}

/**
 * `standalone-production` readiness is recomputed fresh on every call (per
 * the SDK's `createStandaloneReadinessCheck` contract) rather than cached, so
 * a Relay disconnect or a manifest edited on disk is reflected immediately —
 * that is why this function is async for every mode, not only standalone's.
 */
export async function runtimeReadiness(): Promise<DemoReadiness> {
	if (mode === 'standalone-production') {
		if (!standaloneRuntime) {
			return Object.freeze({
				processRunning: true,
				manifestVerified: manifestLint.valid,
				identityPaired: false,
				activeAuthorization: false,
				mode,
				capabilityCount: 0,
				reason: 'IDENTITY_NOT_LOADED',
			});
		}
		const result = await standaloneRuntime.checkReadiness();
		const effective = standaloneRuntime.identityController.peekEffectiveCapabilities();
		return Object.freeze({
			processRunning: true,
			manifestVerified: result.body.reason !== 'MANIFEST_LINT_INVALID',
			identityPaired: result.body.reason !== 'IDENTITY_NOT_LOADED',
			activeAuthorization: result.ok,
			mode,
			capabilityCount: effective.scopes.length,
			grantEpoch: effective.grantEpoch,
			...(result.body.reason ? { reason: result.body.reason } : {}),
		});
	}
	return Object.freeze({
		processRunning: true,
		manifestVerified: manifestLint.valid,
		identityPaired,
		activeAuthorization,
		mode,
		capabilityCount: capabilities.scopes.length,
		...(capabilities.grantEpoch !== undefined ? { grantEpoch: capabilities.grantEpoch } : {}),
		...(reason ? { reason } : {}),
	});
}

/** Managed-mode helper. Returns a static "unavailable" snapshot outside `managed` — standalone-production's capabilities have a different shape, surfaced through `runtimeReadiness()` instead. */
export async function getEffectiveCapabilities(): Promise<EffectiveCapabilities> {
	if (mode !== 'managed') return capabilities;
	capabilities = await identity.getEffectiveCapabilities();
	return capabilities;
}

/**
 * Resolve the Hub's own origin — not this app's public URL from
 * `getPlatformContext()` — for backend calls that must reach the Hub
 * directly (the agent bot credential self-check). `managed` reuses the
 * paired workload broker context, the same source `verifyInboundDispatch`
 * below trusts. `standalone-production` reuses the paired identity file's
 * Relay origin — the standalone analogue of the broker's `hubOrigin`.
 * `development` has no broker; it reuses the legacy relay's `PRIVOS_URL`,
 * the only Hub address available outside a managed or paired runtime.
 * Returns `undefined` when none is available.
 */
export async function resolveHubOrigin(): Promise<string | undefined> {
	if (mode === 'development') {
		const relayUrl = process.env.PRIVOS_URL;
		return relayUrl && /^https?:\/\//.test(relayUrl) ? relayUrl.replace(/\/+$/, '') : undefined;
	}
	if (mode === 'standalone-production') {
		return standaloneRuntime?.relayOrigin;
	}
	try {
		return (await identity.brokerContext()).hubOrigin;
	} catch {
		return undefined;
	}
}

export type VerifiedInboundDispatch = Readonly<{
	jti: string;
	issuedAt: number;
	expiresAt: number;
	actor?: VerifiedActor;
	roomId?: string;
}>;

/**
 * The managed Cluster dispatch assertion embeds its own actor claim
 * (`subject`/`username`/`roomId` — {@link VerifiedDispatchActor}), a
 * different shape from the SDK's unified `VerifiedActor` (`userId` +
 * `claims` + `provenance`) that Relay's Hub-signed user-token verification
 * produces. Normalize to `VerifiedActor` here so `handleMcpMessage` has one
 * actor shape regardless of transport. There is no underlying JWT for this
 * path, so `claims` is empty; `provenance: 'dispatch-assertion'` records
 * that this actor came from the assertion claim, not a verified user token.
 */
function toVerifiedActor(source: VerifiedDispatchActor | undefined): VerifiedActor | undefined {
	if (!source) return undefined;
	return Object.freeze({
		userId: source.subject,
		...(source.username !== undefined ? { username: source.username } : {}),
		...(source.roomId !== undefined ? { roomId: source.roomId } : {}),
		claims: Object.freeze({}),
		provenance: 'dispatch-assertion' as const,
	});
}

/**
 * Verify a Direct HTTP dispatch. `development` bypasses verification (the
 * SDK's mode resolver already refuses `development` under
 * `NODE_ENV=production`, so this can never be the unsigned-production escape
 * hatch). `standalone-production` has no Direct HTTP trust source at all —
 * Hub dispatch trust there is bound to the Relay connection only — so a
 * Direct `/mcp` request always fails closed rather than silently accepting
 * or silently trusting it.
 */
export async function verifyInboundDispatch(body: unknown, compact: string | undefined): Promise<VerifiedInboundDispatch | undefined> {
	if (mode === 'development') return undefined;
	if (mode === 'standalone-production') {
		throw new Error('Direct HTTP dispatch is not part of the standalone-production trust model; use Relay.');
	}
	if (!compact) throw new Error('DISPATCH_ASSERTION_REQUIRED');
	const context = await identity.brokerContext();
	// A node that attested an App Library generation routes dispatch through its
	// cluster, and that assertion binds the generation rather than a replica. The
	// Hub names the caller only when this app declared `capabilities.verifiedActor`
	// and a user actually initiated the call — an agent-initiated dispatch carries
	// no actor, so absence is normal and must stay usable.
	if (context.binding.generation) {
		const verified = verifyClusterDispatchAssertionV3({ compact, body, context });
		const actor = toVerifiedActor(verified.actor);
		return Object.freeze({
			jti: verified.jti,
			issuedAt: verified.issuedAt,
			expiresAt: verified.expiresAt,
			...(actor ? { actor } : {}),
			...(verified.roomId ? { roomId: verified.roomId } : {}),
		});
	}
	const verified = verifyDispatchAssertion({ compact, body, context });
	const actor = toVerifiedActor(verified.actor);
	return Object.freeze({
		jti: verified.jti,
		issuedAt: verified.issuedAt,
		expiresAt: verified.expiresAt,
		...(actor ? { actor } : {}),
	});
}

export function manifestSecurityReport() {
	return manifestLint;
}

export function stopRuntimeIdentity(): void {
	if (bootstrapTimer) clearInterval(bootstrapTimer);
	bootstrapTimer = undefined;
	identity.dispose();
	void standaloneRuntime?.relayHandle.stop();
	standaloneRuntime = undefined;
}
