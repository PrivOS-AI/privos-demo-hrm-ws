/**
 * Entry point: starts the relay WS client + Vite dev server for UI.
 * Unlike the direct app, this does NOT serve an MCP HTTP endpoint.
 * Instead, it connects outbound to Privos via WebSocket relay.
 */
import 'dotenv/config';
import express from 'express';
import path from 'path';

import { connectRelay } from './relay-client';
import { handleMcpMessage } from './mcp-message-handlers';

const PORT = process.env.PORT || 10002;
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;

async function start() {
	// Start Express for serving UI assets (same as direct app)
	const app = express();
	app.use('/public', express.static(path.join(__dirname, '../public')));

	// CORS for iframe loading
	app.use((_req, res, next) => {
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
		if (_req.method === 'OPTIONS') return res.sendStatus(204);
		next();
	});

	const isDev = process.env.NODE_ENV !== 'production';
	if (isDev) {
		const { createServer: createViteServer } = await import('vite');
		const vite = await createViteServer({
			root: path.join(__dirname, 'ui'),
			base: '/ui/',
			server: { middlewareMode: true, allowedHosts: [new URL(PUBLIC_URL).hostname] },
			appType: 'spa',
		});
		app.use('/ui', vite.middlewares);
	} else {
		app.use('/ui', express.static(path.join(__dirname, '../dist/ui')));
	}

	app.listen(PORT, () => {
		console.log(`UI dev server running on ${PUBLIC_URL}`);
	});

	// Connect to Privos via WebSocket relay
	const privosUrl = process.env.PRIVOS_URL;
	const clientId = process.env.CLIENT_ID;
	const clientSecret = process.env.CLIENT_SECRET;

	if (!privosUrl || !clientId || !clientSecret) {
		console.error('Missing required env vars: PRIVOS_URL, CLIENT_ID, CLIENT_SECRET');
		console.error('Register this app in Privos Admin → Apps → Register Relay App');
		process.exit(1);
	}

	await connectRelay({
		privosUrl,
		clientId,
		clientSecret,
		onMessage: handleMcpMessage,
	});

	console.log('Relay app started — connecting to Privos...');
}

start().catch((err) => {
	console.error('Failed to start:', err);
	process.exit(1);
});
