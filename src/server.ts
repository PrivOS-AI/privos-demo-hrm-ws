/**
 * Entry point: starts the relay WS client + Vite dev server for UI.
 * Unlike the direct app, this does NOT serve an MCP HTTP endpoint.
 * Instead, it connects outbound to Privos via WebSocket relay.
 */
import 'dotenv/config';
import express from 'express';
import path from 'path';

import { connectRelay, pairWithPrivos } from './relay-client';
import { handleMcpMessage } from './mcp-message-handlers';
import _pkg from '../package.json';
const pkg = _pkg as Record<string, any>;

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
	let privosUrl = process.env.PRIVOS_URL;
	let clientId = process.env.CLIENT_ID;
	let clientSecret = process.env.CLIENT_SECRET;

	// First run: no credentials yet — start pairing flow
	if (!privosUrl || !clientId || !clientSecret) {
		console.log('\nNo Privos credentials found. Starting pairing flow...');
		console.log('Get a pairing URL from: Privos Admin → Apps → Register Relay App\n');

		const creds = await pairWithPrivos({
			name: pkg.title || pkg.name,
			description: pkg.description,
			version: pkg.version,
		});

		privosUrl = creds.privosUrl;
		clientId = creds.clientId;
		clientSecret = creds.clientSecret;

		console.log('\nRestarting with saved credentials...\n');
	}

	await connectRelay({
		privosUrl,
		clientId,
		clientSecret,
		onMessage: handleMcpMessage,
	});
}

start().catch((err) => {
	console.error('Failed to start:', err);
	process.exit(1);
});
