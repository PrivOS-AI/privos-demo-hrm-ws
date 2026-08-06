import {
  getWorkloadIdentityClient,
  type EffectiveCapabilities,
  type RoomBoundWorkloadClient,
} from '@privos_ai/app-server/workload';
import type { ToolCallContext } from '@privos_ai/app-server';
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
export const runtimeIdentityClient = getWorkloadIdentityClient();
const manifestLint = lintManifest(createManifest());
let capabilities: EffectiveCapabilities = runtimeIdentityClient.peekEffectiveCapabilities();
let identityPaired = false;
let activeAuthorization = false;
let reason: string | undefined = manifestLint.valid ? undefined : 'MANIFEST_INVALID';
let bootstrapTimer: ReturnType<typeof setInterval> | undefined;

runtimeIdentityClient.onCapabilitiesChanged((next) => {
  capabilities = next;
  identityPaired = ['paired', 'active'].includes(next.status);
  activeAuthorization = next.status === 'active';
  reason = next.reason;
});

async function attemptProductionBootstrap(): Promise<void> {
  if (!manifestLint.valid) return;
  try {
    capabilities = await runtimeIdentityClient.getEffectiveCapabilities({ forceRefresh: !activeAuthorization });
    identityPaired = ['paired', 'active'].includes(capabilities.status);
    activeAuthorization = capabilities.status === 'active';
    reason = capabilities.reason;
    if (activeAuthorization) {
      runtimeIdentityClient.startCapabilityMonitor(30_000);
      if (bootstrapTimer) clearInterval(bootstrapTimer);
      bootstrapTimer = undefined;
    }
  } catch (error) {
    identityPaired = ['paired', 'active'].includes(runtimeIdentityClient.peekEffectiveCapabilities().status);
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
  capabilities = await runtimeIdentityClient.getEffectiveCapabilities();
  return capabilities;
}

/** Derive room authority only from the SDK-verified backend tool context. */
export function roomBoundHub(context: ToolCallContext): RoomBoundWorkloadClient {
  return runtimeIdentityClient.forRoom(context);
}

export function manifestSecurityReport() {
  return manifestLint;
}

export function stopRuntimeIdentity(): void {
  if (bootstrapTimer) clearInterval(bootstrapTimer);
  bootstrapTimer = undefined;
  runtimeIdentityClient.dispose();
}
