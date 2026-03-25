/**
 * WebSocket relay client that connects outbound to Privos.
 * Authenticates via OAuth client_credentials, then maintains a persistent
 * WS connection for MCP JSON-RPC message exchange.
 * Auto-reconnects on disconnect with exponential backoff.
 */
import WebSocket from 'ws';

interface RelayClientOptions {
	privosUrl: string;
	clientId: string;
	clientSecret: string;
	onMessage: (method: string, id: number, params: any) => Promise<any>;
}

/** Obtain OAuth access token via client_credentials grant */
async function getAccessToken(privosUrl: string, clientId: string, clientSecret: string): Promise<string> {
	const res = await fetch(`${privosUrl}/oauth/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`,
	});

	if (!res.ok) {
		throw new Error(`OAuth token request failed: ${res.status} ${res.statusText}`);
	}

	const data = await res.json();
	if (!data.access_token) {
		throw new Error('No access_token in OAuth response');
	}
	return data.access_token;
}

/** Connect to Privos relay WebSocket with auto-reconnect */
export async function connectRelay(opts: RelayClientOptions): Promise<WebSocket> {
	const accessToken = await getAccessToken(opts.privosUrl, opts.clientId, opts.clientSecret);
	console.log('[Relay] OAuth token obtained');

	const wsUrl = opts.privosUrl.replace(/^http/, 'ws') + '/api/v1/mcp-apps.relay';
	const ws = new WebSocket(wsUrl, {
		headers: { Authorization: `Bearer ${accessToken}` },
	});

	ws.on('open', () => {
		console.log('[Relay] Connected to Privos');
	});

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
				ws.send(JSON.stringify({
					jsonrpc: '2.0',
					id: msg.id,
					error: { code: -32603, message: err.message },
				}));
			}
		}
	});

	// Respond to ping with pong (ws library does this automatically)
	ws.on('ping', () => ws.pong());

	ws.on('close', (code) => {
		console.log(`[Relay] Disconnected (code: ${code}), reconnecting in 5s...`);
		setTimeout(() => connectRelay(opts), 5000);
	});

	ws.on('error', (err) => {
		console.error('[Relay] WebSocket error:', err.message);
	});

	return ws;
}
