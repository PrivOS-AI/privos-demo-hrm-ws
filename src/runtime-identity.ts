import {
  WorkloadIdentityClient,
  verifyClusterDispatchAssertionV3,
  verifyDispatchAssertion,
  type EffectiveCapabilities,
  type VerifiedDispatchActor,
} from '@privos_ai/app-server/workload';
import { lintManifest } from '@privos_ai/app-server/manifest-tools';

import { createManifest } from './manifest';

export type DemoRuntimeMode = 'production-workload' | 'development-compatibility';

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

const productionMode = process.env.PRIVOS_RUNTIME_MODE === 'production'
  || (process.env.PRIVOS_RUNTIME_MODE !== 'development' && process.env.NODE_ENV === 'production');
const mode: DemoRuntimeMode = productionMode ? 'production-workload' : 'development-compatibility';
const identity = new WorkloadIdentityClient();
const manifestLint = lintManifest(createManifest());
let capabilities: EffectiveCapabilities = identity.peekEffectiveCapabilities();
let identityPaired = false;
let activeAuthorization = false;
let reason: string | undefined = manifestLint.valid ? undefined : 'MANIFEST_INVALID';
let bootstrapTimer: ReturnType<typeof setInterval> | undefined;

identity.onCapabilitiesChanged((next) => {
  capabilities = next;
  identityPaired = ['paired', 'active'].includes(next.status);
  activeAuthorization = next.status === 'active';
  reason = next.reason;
});

async function attemptProductionBootstrap(): Promise<void> {
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

/** Start bounded in-process reconciliation; no credentials are accepted or persisted. */
export function startRuntimeIdentity(): void {
  if (!productionMode) {
    identityPaired = false;
    activeAuthorization = manifestLint.valid;
    reason = manifestLint.valid ? undefined : 'MANIFEST_INVALID';
    return;
  }
  void attemptProductionBootstrap();
  if (!bootstrapTimer) {
    bootstrapTimer = setInterval(() => void attemptProductionBootstrap(), 10_000);
    bootstrapTimer.unref();
  }
}

export function runtimeMode(): DemoRuntimeMode {
  return mode;
}

export function runtimeReadiness(): DemoReadiness {
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

export async function getEffectiveCapabilities(): Promise<EffectiveCapabilities> {
  if (!productionMode) return capabilities;
  capabilities = await identity.getEffectiveCapabilities();
  return capabilities;
}

export type VerifiedInboundDispatch = Readonly<{
  jti: string;
  issuedAt: number;
  expiresAt: number;
  actor?: VerifiedDispatchActor;
  roomId?: string;
}>;

export async function verifyInboundDispatch(body: unknown, compact: string | undefined): Promise<VerifiedInboundDispatch | undefined> {
  if (!productionMode) return undefined;
  if (!compact) throw new Error('DISPATCH_ASSERTION_REQUIRED');
  const context = await identity.brokerContext();
  // A node that attested an App Library generation routes dispatch through its
  // cluster, and that assertion binds the generation rather than a replica. It
  // carries no actor: the Hub authorizes the call, it does not name the caller.
  if (context.binding.generation) {
    const verified = verifyClusterDispatchAssertionV3({ compact, body, context });
    return Object.freeze({
      jti: verified.jti,
      issuedAt: verified.issuedAt,
      expiresAt: verified.expiresAt,
      ...(verified.roomId ? { roomId: verified.roomId } : {}),
    });
  }
  return verifyDispatchAssertion({ compact, body, context });
}

export function manifestSecurityReport() {
  return manifestLint;
}

export function stopRuntimeIdentity(): void {
  if (bootstrapTimer) clearInterval(bootstrapTimer);
  bootstrapTimer = undefined;
  identity.dispose();
}
