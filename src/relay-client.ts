/**
 * WebSocket relay client that connects outbound to Privos.
 * Development compatibility only. Supports two flows:
 *   1. Pairing: connect with ?pair=<token>, send metadata, receive credentials, save to .env
 *   2. Normal: authenticate via OAuth client_credentials, maintain persistent WS for MCP JSON-RPC
 */
import fs from 'fs';
import path from 'path';
import readline from 'readline';

import WebSocket from 'ws';

interface RelayClientOptions {
	privosUrl: string;
	clientId: string;
	clientSecret: string;
	onMessage: (method: string, id: number, params: any) => Promise<any>;
}

function assertDevelopmentRelay(): void {
	if (
		process.env.PRIVOS_RUNTIME_MODE !== 'development' ||
		process.env.PRIVOS_ALLOW_LEGACY_RELAY_PAIRING !== '1' ||
		process.env.NODE_ENV === 'production'
	) {
		throw new Error('Legacy relay credentials are disabled outside explicit development mode.');
	}
}

/** Prompt user for input in terminal */
function prompt(question: string): Promise<string> {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((resolve) => {
		rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
	});
}

/** Save key=value pairs to .env file (create or update existing keys) */
function saveToEnv(vars: Record<string, string>): void {
	const envPath = path.join(process.cwd(), '.env');
	let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';

	for (const [key, value] of Object.entries(vars)) {
		const regex = new RegExp(`^${key}=.*$`, 'm');
		if (regex.test(content)) {
			content = content.replace(regex, `${key}=${value}`);
		} else {
			content += `${content.endsWith('\n') || content === '' ? '' : '\n'}${key}=${value}\n`;
		}
	}
	fs.writeFileSync(envPath, content);
}

/**
 * Pair with Privos using a one-time pairing URL.
 * Connects WS, sends app metadata, receives OAuth credentials, saves to .env.
 */
export async function pairWithPrivos(appMeta: { name: string; description?: string; version?: string; icon?: string; scopes?: string[] }): Promise<{
	privosUrl: string; clientId: string; clientSecret: string;
}> {
	assertDevelopmentRelay();
	const pairUrl = await prompt('\nEnter the Privos relay pairing URL: ');
	if (!pairUrl) throw new Error('No URL provided');

	console.log('[Relay] Connecting to Privos for pairing...');

	return new Promise((resolve, reject) => {
		const ws = new WebSocket(pairUrl);

		ws.on('open', () => {
			ws.send(JSON.stringify({
				name: appMeta.name,
				description: appMeta.description || '',
				version: appMeta.version || '0.0.0',
				...(appMeta.icon && { icon: appMeta.icon }),
				...(appMeta.scopes?.length && { scopes: appMeta.scopes }),
			}));
			console.log('[Relay] Sent app metadata, waiting for credentials...');
		});

		ws.on('message', (raw: Buffer) => {
			const msg = JSON.parse(raw.toString());
			if (msg.error) {
				reject(new Error(msg.error.message || 'Pairing failed'));
				return;
			}
			if (msg.result?.paired) {
				const { clientId, clientSecret, relayUrl } = msg.result;
				const privosUrl = relayUrl.replace(/^ws/, 'http').replace(/\/api\/v1\/mcp-apps\.relay.*/, '');

				saveToEnv({ PRIVOS_URL: privosUrl, CLIENT_ID: clientId, CLIENT_SECRET: clientSecret });
				console.log('[Relay] Paired! Credentials saved to .env');
				console.log(`[Relay]   Client ID: ${clientId}`);
				console.log(`[Relay]   Privos URL: ${privosUrl}`);
				resolve({ privosUrl, clientId, clientSecret });
			}
		});

		ws.on('error', (err) => reject(new Error(`Pairing failed: ${err.message}`)));
		ws.on('close', (code, reason) => {
			if (code !== 1000) reject(new Error(`Pairing closed: ${code} ${reason}`));
		});
	});
}

/** Obtain OAuth access token via client_credentials grant */
async function getAccessToken(privosUrl: string, clientId: string, clientSecret: string): Promise<string> {
	const res = await fetch(`${privosUrl}/oauth/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`,
	});
	if (!res.ok) throw new Error(`OAuth token failed: ${res.status} ${res.statusText}`);
	const data = await res.json();
	if (!data.access_token) throw new Error('No access_token in response');
	return data.access_token;
}

const BACKOFF_SCHEDULE_MS = [5_000, 10_000, 20_000, 40_000, 60_000];
let reconnectAttempt = 0;

/** Schedule a reconnect with exponential backoff (caps at 60s).
 *  Keeps retrying indefinitely — handles multi-day Privos outages.
 *  If `connectRelay` itself throws (e.g. OAuth fails because Privos is still
 *  down), the catch re-schedules so we never stop trying. */
function scheduleReconnect(opts: RelayClientOptions): void {
	const delay = BACKOFF_SCHEDULE_MS[Math.min(reconnectAttempt, BACKOFF_SCHEDULE_MS.length - 1)];
	reconnectAttempt++;
	console.log(`[Relay] Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempt})...`);
	setTimeout(() => {
		connectRelay(opts).catch((err) => {
			console.error('[Relay] Reconnect attempt failed:', err?.message || err);
			scheduleReconnect(opts);
		});
	}, delay);
}

// The hub pings every 30s, so a healthy connection receives traffic at least
// that often. If nothing arrives for two ping cycles (+ margin), the socket is
// a half-open zombie — e.g. a proxy dropped the origin leg without closing
// ours, so the 'close' event never fires on its own. terminate() forces it,
// which hands control to scheduleReconnect().
const IDLE_TIMEOUT_MS = 75_000;

/** Connect to Privos relay WebSocket with auto-reconnect + liveness watchdog. */
export async function connectRelay(opts: RelayClientOptions): Promise<WebSocket> {
	assertDevelopmentRelay();
	const accessToken = await getAccessToken(opts.privosUrl, opts.clientId, opts.clientSecret);
	console.log('[Relay] OAuth token obtained');

	const wsUrl = opts.privosUrl.replace(/^http/, 'ws') + '/api/v1/mcp-apps.relay';
	const ws = new WebSocket(wsUrl, { headers: { Authorization: `Bearer ${accessToken}` } });

	let watchdog: ReturnType<typeof setTimeout> | undefined;
	const resetWatchdog = () => {
		clearTimeout(watchdog);
		watchdog = setTimeout(() => {
			console.warn(`[Relay] No ping/data for ${IDLE_TIMEOUT_MS / 1000}s — connection is dead, terminating`);
			ws.terminate();
		}, IDLE_TIMEOUT_MS);
	};

	ws.on('open', () => {
		console.log(`[Relay] Connected to Privos${reconnectAttempt > 0 ? ` (after ${reconnectAttempt} reconnect attempt${reconnectAttempt > 1 ? 's' : ''})` : ''}`);
		reconnectAttempt = 0;
		resetWatchdog();
	});

	ws.on('message', async (raw: Buffer) => {
		resetWatchdog();
		const msg = JSON.parse(raw.toString());
		if (msg.jsonrpc !== '2.0' || !msg.method) return;
		try {
			const result = await opts.onMessage(msg.method, msg.id, msg.params);
			if (msg.id !== undefined) {
				ws.send(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }));
			}
		} catch (err: any) {
			if (msg.id !== undefined) {
				ws.send(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: err.message } }));
			}
		}
	});

	ws.on('ping', () => {
		ws.pong();
		resetWatchdog();
	});
	ws.on('close', (code) => {
		clearTimeout(watchdog);
		console.log(`[Relay] Disconnected (code: ${code})`);
		scheduleReconnect(opts);
	});
	ws.on('error', (err) => console.error('[Relay] WS error:', err.message));

	return ws;
}
