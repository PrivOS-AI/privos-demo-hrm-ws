/**
 * Entry point. `serveApp` resolves exactly one of `managed` /
 * `standalone-production` / `development` (precedence managed >
 * standalone-production > development; a fatal `RuntimeModeError` when both a
 * managed workload socket and a paired standalone identity file are present, or
 * when `NODE_ENV=production` has neither) and wires the correct transport +
 * trust bootstrap + agent-bot hub internally.
 *
 * The ONE piece that stays app-local (by design) is the interactive
 * `development` Relay loop: `PRIVOS_TRANSPORT=relay` (`npm run dev`) steps
 * `serveApp` aside from the Direct HTTP MCP router and runs the terminal
 * pairing prompt + optional Vite dev-UI here. `PRIVOS_TRANSPORT` is a
 * development affordance only — `serveApp` rejects `transportOverride` under any
 * production mode as a boot error.
 *
 * `/.well-known/mcp/manifest.json` is served from `createManifest()` (the exact
 * reviewed marketplace manifest, digest-pinned) via the `configure` hook, ahead
 * of the router, so the published manifest bytes never change.
 */
import 'dotenv/config';

import { serveApp } from '@privos_ai/app-server';

import { createManifest, buildRelayAppDescriptor } from './manifest';
import { relayMcpHandler } from './relay-transport';

async function start(): Promise<void> {
	const transportOverride = process.env.PRIVOS_TRANSPORT === 'relay' ? ('relay' as const) : undefined;

	const handle = await serveApp({
		descriptor: buildRelayAppDescriptor(),
		createHandler: () => relayMcpHandler,
		port: Number(process.env.PORT || 3000),
		...(transportOverride ? { transportOverride } : {}),
		resolveManifest: () => createManifest(),
		configure: (app) => {
			// Serve the authoritative reviewed manifest verbatim, before the MCP
			// router's own manifest route, so the digest-pinned bytes are exact.
			app.get('/.well-known/mcp/manifest.json', (_req, res) => res.json(createManifest()));
		},
	});

	// development + PRIVOS_TRANSPORT=relay: run the app-local pairing loop (and
	// optional live Vite dev UI) alongside serveApp's HTTP support surface.
	if (handle.mode === 'development' && transportOverride === 'relay') {
		if (process.env.PRIVOS_DEV_UI === '1') {
			const { startDevUiServer } = await import('./dev-server');
			const { setDevPublicUrl } = await import('./mcp-message-handlers');
			const dev = await startDevUiServer();
			setDevPublicUrl(dev.publicUrl);
		}
		const { startDevelopmentRelay } = await import('./relay-transport');
		await startDevelopmentRelay();
	}
}

start().catch((err) => {
	console.error('Failed to start:', err instanceof Error ? err.message : err);
	process.exit(1);
});
