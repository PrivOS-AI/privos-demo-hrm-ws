/**
 * Resolve the Hub's own origin — not this app's public URL — for backend calls
 * that must reach the Hub directly (the agent-bot credential self-check).
 *
 * Since `serveApp` now owns transport and the workload/identity plumbing, this
 * is a thin, mode-aware lookup over SDK primitives only:
 *  - `development`: the legacy relay `PRIVOS_URL`, the only Hub address outside
 *    a managed or paired runtime.
 *  - `standalone-production`: the paired identity file's Relay origin.
 *  - `managed`: the workload broker's `hubOrigin` — read from the same
 *    `getWorkloadIdentityClient()` singleton `serveApp` bootstraps.
 * Returns `undefined` when none is available.
 */
import { getWorkloadIdentityClient, loadStandaloneIdentity, resolveRuntimeMode } from '@privos_ai/app-server';

export async function resolveHubOrigin(): Promise<string | undefined> {
	let mode: string;
	try {
		mode = resolveRuntimeMode().mode;
	} catch {
		return undefined;
	}
	if (mode === 'development') {
		const url = process.env.PRIVOS_URL;
		return url && /^https?:\/\//.test(url) ? url.replace(/\/+$/, '') : undefined;
	}
	if (mode === 'standalone-production') {
		try {
			return loadStandaloneIdentity().relay.privosUrl;
		} catch {
			return undefined;
		}
	}
	try {
		return (await getWorkloadIdentityClient().brokerContext()).hubOrigin;
	} catch {
		return undefined;
	}
}
