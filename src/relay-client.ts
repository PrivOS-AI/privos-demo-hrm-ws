/**
 * WebSocket relay client that connects outbound to Privos.
 * Supports two flows:
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
export async function pairWithPrivos(appMeta: { name: string; description?: string; version?: string; icon?: string }): Promise<{
	privosUrl: string; clientId: string; clientSecret: string;
}> {
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

/** Connect to Privos relay WebSocket with auto-reconnect */
export async function connectRelay(opts: RelayClientOptions): Promise<WebSocket> {
	const accessToken = await getAccessToken(opts.privosUrl, opts.clientId, opts.clientSecret);
	console.log('[Relay] OAuth token obtained');

	const wsUrl = opts.privosUrl.replace(/^http/, 'ws') + '/api/v1/mcp-apps.relay';
	const ws = new WebSocket(wsUrl, { headers: { Authorization: `Bearer ${accessToken}` } });

	ws.on('open', () => console.log('[Relay] Connected to Privos'));

	ws.on('message', async (raw: Buffer) => {
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

	ws.on('ping', () => ws.pong());
	ws.on('close', (code) => {
		console.log(`[Relay] Disconnected (code: ${code}), reconnecting in 5s...`);
		setTimeout(() => connectRelay(opts), 5000);
	});
	ws.on('error', (err) => console.error('[Relay] WS error:', err.message));

	return ws;
}
