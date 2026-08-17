/**
 * Relay transport wiring for the two runtime modes that talk MCP over the
 * SDK's outbound Relay WebSocket instead of inbound Direct HTTP dispatch, so
 * this app never needs a publicly reachable inbound port to be paired with a
 * Hub:
 *
 * - `development` (`npm run dev` / `npm run start:relay`): relaxed
 *   compatibility pairing, cached to `.env`, unverified actor. Never
 *   persisted as a standalone identity file — see {@link startDevelopmentRelay}.
 * - `standalone-production` (`npm run start:standalone`): loads a previously
 *   paired identity file (see `scripts/pair-standalone.ts`) and connects with
 *   mandatory signed-assertion verification — see
 *   {@link startStandaloneProductionRelay}.
 */
import fs from 'fs';
import path from 'path';
import readline from 'readline';

import WebSocket from 'ws';
import {
	connectRelay,
	createStandaloneReadinessCheck,
	createStandaloneRelayIdentityController,
	loadStandaloneIdentity,
	pairFromDescriptor,
	type ApplicationMcpRequest,
	type PairingResult,
	type RelayHandle,
	type StandaloneReadinessResult,
	type StandaloneRelayIdentityController,
	type ToolCallContext,
} from '@privos_ai/app-server';

import { buildRelayAppDescriptor, createManifest } from './manifest';
import { handleMcpMessage } from './mcp-message-handlers';

/**
 * Adapts this app's own `(method, id, params, actor)` handler to the SDK's
 * `AppMcpHandler` contract. `initialize` / `notifications/initialized` never
 * reach here — the SDK runtime answers those from the descriptor.
 *
 * Relay dispatch (`VerifiedRuntimeDispatchAssertionV3`, both development and
 * standalone-production) carries no bound actor claim itself — unlike the
 * managed Direct HTTP path's cluster assertion, the runtime-v3 relay
 * envelope only proves *which installation* dispatched the call, not *which
 * user*. Naming a verified user over Relay instead needs a SEPARATE
 * Hub-signed RS256 user token, verified against the Hub's JWKS and
 * cross-bound to the already-verified `roomId`. `connectRelay`'s
 * `hubUserTokenAuth: 'auto'` default wires this in automatically and
 * populates `context.actor` whenever a Hub dispatch trust is configured —
 * true for `startStandaloneProductionRelay()` below (its `standaloneIdentity`
 * pins the trust). `startDevelopmentRelay()`'s relaxed compatibility pairing
 * intentionally configures no dispatch trust at all, so the SDK's
 * auto-wiring condition is not met there and `context.actor` stays
 * `undefined` — the same unverified-in-development posture as before.
 * `context.actor` is forwarded as-is; `handleMcpMessage` fails closed on
 * `undefined` and never reads any other, unverified field.
 */
export async function relayMcpHandler(request: ApplicationMcpRequest, context: ToolCallContext): Promise<unknown> {
	const id = typeof request.id === 'number' ? request.id : 0;
	return handleMcpMessage(request.method, id, request.params, context.actor);
}

function relayLogger(prefix: string): (event: string, fields: Record<string, unknown>) => void {
	return (event, fields) => {
		if (event.includes('error') || event.includes('fail') || event.includes('rejected')) {
			console.error(`${prefix} ✗ ${event}`, fields);
		} else {
			console.log(`${prefix} · ${event}`);
		}
	};
}

/** Prompt for input in the terminal — development pairing only. */
function prompt(question: string): Promise<string> {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			rl.close();
			resolve(answer.trim());
		});
	});
}

/** Save key=value pairs to `.env` (create or update existing keys) — development cache only. */
function saveDevCredentialsToEnv(vars: Record<string, string>): void {
	const envPath = path.join(process.cwd(), '.env');
	let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
	for (const [key, value] of Object.entries(vars)) {
		const regex = new RegExp(`^${key}=.*$`, 'm');
		content = regex.test(content)
			? content.replace(regex, `${key}=${value}`)
			: `${content}${content.endsWith('\n') || content === '' ? '' : '\n'}${key}=${value}\n`;
	}
	fs.writeFileSync(envPath, content);
}

/**
 * `npm run dev` / `npm run start:relay`. Reuses cached `.env` credentials
 * when present; otherwise prompts for a one-time pairing URL and caches the
 * result. `persistIdentityFile: false` is load-bearing: a standalone identity
 * file on disk would make the *next* boot resolve to `standalone-production`
 * instead of `development` (see `resolveRuntimeMode` precedence), silently
 * changing this loop's trust model. No `standaloneIdentity` is passed to
 * `connectRelay`, so dispatch stays unverified — matching the pre-adoption
 * "development compatibility" behavior exactly.
 */
export async function startDevelopmentRelay(): Promise<RelayHandle> {
	let privosUrl = process.env.PRIVOS_URL;
	let clientId = process.env.CLIENT_ID;
	let clientSecret = process.env.CLIENT_SECRET;

	if (!privosUrl || !clientId || !clientSecret) {
		console.log('\nNo Privos credentials found. Starting pairing flow...');
		console.log('Get a pairing URL from: Privos Admin → Apps → Register Relay App\n');
		const pairUrl = await prompt('Enter the Privos relay pairing URL: ');
		if (!pairUrl) throw new Error('No pairing URL provided');

		const paired: PairingResult = await pairFromDescriptor(pairUrl, buildRelayAppDescriptor(), WebSocket, {
			persistIdentityFile: false,
		});
		privosUrl = paired.privosUrl;
		clientId = paired.clientId;
		clientSecret = paired.clientSecret;

		saveDevCredentialsToEnv({ PRIVOS_URL: privosUrl, CLIENT_ID: clientId, CLIENT_SECRET: clientSecret });
		console.log('[Relay] Paired! Credentials cached to .env for the next `npm run dev`.');
		console.log(`[Relay]   Client ID: ${clientId}`);
		console.log(`[Relay]   Privos URL: ${privosUrl}`);
	}

	const handle = connectRelay({
		privosUrl,
		clientId,
		clientSecret,
		descriptor: buildRelayAppDescriptor(),
		handler: relayMcpHandler,
		logger: relayLogger('[Relay]'),
	});
	await handle.whenConnected();
	console.log('Relay app running — connected to Privos (development compatibility, unverified actor).');
	return handle;
}

export type StandaloneProductionRuntime = Readonly<{
	relayHandle: RelayHandle;
	identityController: StandaloneRelayIdentityController;
	/** Origin the paired Hub is reached at — the standalone analogue of the managed broker's `hubOrigin`. */
	relayOrigin: string;
	fingerprint: string;
	checkReadiness: () => Promise<StandaloneReadinessResult>;
}>;

/**
 * `npm run start:standalone`. Loads the identity file a prior
 * `npm run pair:standalone` produced (throws `StandaloneIdentityError` when
 * missing/invalid/wrong-mode — a fatal boot error, never a relaxed
 * fallback), connects Relay with `standaloneIdentity` set (forces
 * `effectiveRuntimeDispatchV3.mode = 'required'` — every dispatch must carry
 * a valid Hub-signed assertion), and wires the SDK's readiness contract
 * (identity + Relay-authenticated + manifest-lint + manifest-digest-drift).
 */
export function startStandaloneProductionRelay(): StandaloneProductionRuntime {
	const loaded = loadStandaloneIdentity();
	const identityController = createStandaloneRelayIdentityController(loaded, {
		logger: (event, fields) => console.log(`[standalone] ${event}`, fields),
	});
	const relayHandle = connectRelay({
		privosUrl: loaded.relay.privosUrl,
		standaloneIdentity: identityController,
		descriptor: buildRelayAppDescriptor(),
		handler: relayMcpHandler,
		logger: relayLogger('[Relay]'),
	});
	const checkReadiness = createStandaloneReadinessCheck({
		isRelayAuthenticated: () => relayHandle.isConnected(),
		resolveManifest: () => createManifest(),
	});
	return {
		relayHandle,
		identityController,
		relayOrigin: loaded.relay.privosUrl,
		fingerprint: loaded.fingerprint,
		checkReadiness,
	};
}
