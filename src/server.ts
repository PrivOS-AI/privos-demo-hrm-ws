/**
 * Entry point: connects to Privos via WebSocket relay.
 * No HTTP server needed — UI is delivered inline via MCP resources/read.
 * On first run (no credentials), starts the pairing flow.
 */
import 'dotenv/config';

import { connectRelay, pairWithPrivos } from './relay-client';
import { handleMcpMessage } from './mcp-message-handlers';
import _pkg from '../package.json';
const pkg = _pkg as Record<string, any>;

async function start() {
	let privosUrl = process.env.PRIVOS_URL;
	let clientId = process.env.CLIENT_ID;
	let clientSecret = process.env.CLIENT_SECRET;

	// First run: no credentials — start pairing flow
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

		console.log('\nConnecting with saved credentials...\n');
	}

	await connectRelay({
		privosUrl,
		clientId,
		clientSecret,
		onMessage: handleMcpMessage,
	});

	console.log('Relay app running — connected to Privos');
}

start().catch((err) => {
	console.error('Failed to start:', err);
	process.exit(1);
});
