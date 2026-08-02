/**
 * Entry point. Production uses direct private Cluster dispatch plus broker-based
 * workload identity. Legacy WebSocket pairing is explicit development-only
 * compatibility and is refused when NODE_ENV=production.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

import { connectRelay, pairWithPrivos } from './relay-client';
import { handleMcpMessage, setDevPublicUrl } from './mcp-message-handlers';
import { runtimeMode, startRuntimeIdentity } from './runtime-identity';
import _pkg from '../privos-app.json';
const pkg = _pkg as Record<string, any>;
const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** Read icon file as data URI for pairing metadata */
function getIconDataUri(): string | undefined {
	const iconPath = pkg.icon?.startsWith('/') ? path.join(moduleDir, '..', pkg.icon) : undefined;
	if (!iconPath || !fs.existsSync(iconPath)) return undefined;
	const ext = path.extname(iconPath).slice(1);
	const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
	const data = fs.readFileSync(iconPath).toString('base64');
	return `data:${mime};base64,${data}`;
}

async function startRelay() {
	if (runtimeMode() !== 'development-compatibility' || process.env.PRIVOS_ALLOW_LEGACY_RELAY_PAIRING !== '1') {
		throw new Error('Relay client-credential compatibility is available only in explicit development mode.');
	}
	let privosUrl = process.env.PRIVOS_URL;
	let clientId = process.env.CLIENT_ID;
	let clientSecret = process.env.CLIENT_SECRET;

	// Dev mode (npm run dev): serve UI live from a Vite dev server over a public
	// tunnel so the iframe gets HMR + breakpoints. Production keeps the inline bundle.
	if (process.env.PRIVOS_DEV_UI === '1') {
		const { startDevUiServer } = await import('./dev-server');
		const dev = await startDevUiServer();
		setDevPublicUrl(dev.publicUrl);
	}

	// First run: no credentials — start pairing flow
	if (!privosUrl || !clientId || !clientSecret) {
		console.log('\nNo Privos credentials found. Starting pairing flow...');
		console.log('Get a pairing URL from: Privos Admin → Apps → Register Relay App\n');

		const creds = await pairWithPrivos({
			name: pkg.title || pkg.name,
			description: pkg.description,
			version: pkg.version,
			icon: getIconDataUri(),
			// The legacy relay handshake only understands a flat scope list. This
			// compatibility projection is never used by managed production installs.
			scopes: Array.isArray(pkg.permissions) ? pkg.permissions.map((permission: any) => permission.scope) : undefined,
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

async function start() {
	const transport = process.env.PRIVOS_TRANSPORT || 'direct';
	if (transport === 'direct') {
		const { startHttpServer } = await import('./http-server');
		startHttpServer();
		startRuntimeIdentity();
		return;
	}
	if (transport !== 'relay') throw new Error(`Unsupported PRIVOS_TRANSPORT: ${transport}`);
	await startRelay();
}

start().catch((err) => {
	console.error('Failed to start:', err);
	process.exit(1);
});
