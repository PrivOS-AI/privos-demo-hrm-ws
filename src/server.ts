/**
 * Entry point. `resolveRuntimeMode()` (inside `runtime-identity.ts`) picks
 * exactly one of `managed` / `standalone-production` / `development` —
 * precedence managed > standalone-production > development — and is a fatal
 * boot error (`RuntimeModeError`, caught below by `start().catch`) when both
 * a managed workload socket and a paired standalone identity file are
 * present, or when `NODE_ENV=production` has neither.
 *
 * `managed` and `standalone-production` each own a single fixed transport
 * (Direct HTTP via the workload broker, Relay via the paired identity file).
 * `development` additionally offers a transport choice: Direct HTTP for
 * quick local `/mcp` checks (`npm start`, the default), or Relay pairing for
 * a live Hub-embedded UI loop (`npm run dev` / `npm run start:relay`,
 * `PRIVOS_TRANSPORT=relay`) — unverified actor either way, and the SDK's
 * mode resolver already refuses `development` outright under
 * `NODE_ENV=production`, so neither path can become a production escape
 * hatch.
 */
import 'dotenv/config';

async function start() {
	const { runtimeMode, startRuntimeIdentity } = await import('./runtime-identity');
	const { startHttpServer } = await import('./http-server');
	startHttpServer();
	startRuntimeIdentity();

	if (runtimeMode() !== 'development') return;

	const transport = process.env.PRIVOS_TRANSPORT || 'direct';
	if (transport === 'direct') return;
	if (transport !== 'relay') throw new Error(`Unsupported PRIVOS_TRANSPORT: ${transport}`);

	// Dev mode (npm run dev): serve UI live from a Vite dev server over a public
	// tunnel so the iframe gets HMR + breakpoints. Production keeps the inline bundle.
	if (process.env.PRIVOS_DEV_UI === '1') {
		const { startDevUiServer } = await import('./dev-server');
		const { setDevPublicUrl } = await import('./mcp-message-handlers');
		const dev = await startDevUiServer();
		setDevPublicUrl(dev.publicUrl);
	}

	const { startDevelopmentRelay } = await import('./relay-transport');
	await startDevelopmentRelay();
}

start().catch((err) => {
	console.error('Failed to start:', err);
	process.exit(1);
});
