/**
 * MCP JSON-RPC method handlers for the relay demo app.
 * UI is delivered fully inline via resources/read — no external URL references.
 * In production: reads built assets from dist/ui/ and embeds them in HTML.
 * In development: reads source and builds on-the-fly via Vite.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

import { getPlatformContext, publicUrlFor, type VerifiedActor } from '@privos_ai/app-server';

import _pkg from '../privos-app.json';
import { getAppIconDataUri } from './app-icon';
import { createLicenseGuard } from './license';
import { checkAgentBotCredential } from './agent-bot-credential-check';
import { APP_OBJECT_STORE_TOOL, APP_DB_STORE_TOOL, APP_PLATFORM_TOOL_DEFINITIONS } from './app-platform-demo-tool-defs';
import { handleAppObjectStoreTool } from './app-objects-demo-tool';
import { handleAppDbStoreTool } from './app-db-demo-tool';
const pkg = _pkg as Record<string, any>;
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const TOOL_NAME = 'hr_management_dashboard';
// Pure data (no UI) tool: returns the SDK-verified caller actor — Managed Direct
// HTTP names it in the body-bound Hub dispatch assertion; Relay names it via a
// separately Hub-signed user token verified against the Hub's JWKS. See
// `handleWhoami` and `handleMcpMessage`'s `actor` parameter doc below.
const WHOAMI_TOOL = 'hr_whoami';
const BULK_EXPORT_TOOL = 'hr_bulk_export';
// Pure data (no UI) tool: proves the configured agent bot credential actually
// authenticates against the Hub. See agent-bot-credential-check.ts.
const CREDENTIAL_CHECK_TOOL = 'hr_agent_bot_credential_check';
const UI_RESOURCE_URI = 'ui://privos-mcp-app-demo/form.html';

/**
 * Embed origins this app declares, read straight from the published manifest so the runtime
 * advertisement and the marketplace listing can never disagree about what was requested.
 */
const UI_DECLARED_CSP: Record<string, string[]> | undefined = (pkg.tools as any[] | undefined)?.find(
	(tool) => tool?.ui?.resourceUri === UI_RESOURCE_URI,
)?.ui?.csp;

const appIcon = getAppIconDataUri();

/** Cache the built UI HTML — invalidated when dist changes (dev watch mode) */
let cachedUiHtml: string | null = null;
let lastBuildMtime = 0;

/**
 * When set, the UI is served live from a Vite dev server at this public origin
 * (HMR + breakpoints) instead of an inlined production bundle. See dev-server.ts.
 */
let devPublicUrl: string | null = null;

/** Enable dev mode: iframe loads UI from the Vite dev server at `publicUrl`. */
export function setDevPublicUrl(publicUrl: string): void {
	devPublicUrl = publicUrl.replace(/\/$/, '');
}

/** Clear cache so next resources/read picks up rebuilt UI */
export function invalidateUiCache(): void {
	cachedUiHtml = null;
}

/**
 * Handle an incoming MCP JSON-RPC request and return the result.
 *
 * `actor` is the SDK's unified {@link VerifiedActor} — the same shape for
 * both transports, distinguished only by `actor.provenance`:
 *   - `'dispatch-assertion'` — Managed Direct HTTP; the Hub embedded the
 *     actor claim directly in the body-bound Cluster dispatch assertion
 *     verified by `verifyInboundDispatch` before this call.
 *   - `'user-token'` — Relay (`standalone-production`, and `development`
 *     whenever a Hub dispatch trust is configured); the SDK independently
 *     verified a separate Hub-signed RS256 user JWT against the Hub's JWKS
 *     and cross-bound it to the already-verified dispatch `roomId`.
 * `undefined` means no verified caller identity is available for this
 * request (no token was presented, the token was invalid, or JWKS
 * verification failed) — callers must treat that as "unknown", never fall
 * back to any unverified out-of-band field.
 */
export async function handleMcpMessage(
	method: string,
	_id: number,
	params: any,
	actor?: VerifiedActor,
): Promise<any> {
	switch (method) {
		case 'initialize':
			return {
				protocolVersion: '2025-03-26',
				capabilities: {
					tools: {},
					extensions: {
						'io.modelcontextprotocol/ui': {
							mimeTypes: ['text/html;profile=mcp-app'],
						},
					},
				},
				serverInfo: {
				name: pkg.title || pkg.name,
				version: pkg.version,
				...(appIcon && { icon: appIcon }),
				// Advertise the exact schema-v2 declaration; Hub owns catalog metadata
				// and still enforces the selected subset server-side.
				...(Array.isArray(pkg.permissions) && { permissions: pkg.permissions }),
			},
			};

		case 'notifications/initialized':
			return {};

		case 'tools/list':
			return {
				tools: [
					{
						name: TOOL_NAME,
							title: pkg.title || 'PrivOS Demo MCP App',
						description: pkg.description || 'HR management dashboard',
						inputSchema: {
							type: 'object',
							properties: { roomId: { type: 'string' } },
						},
						_meta: {
							// The CSP block declares the external origins this app's UI would like to
							// embed. It grants nothing: a workspace admin approves what may actually
							// load, and the Hub enforces that approval on the served document.
							ui: { resourceUri: UI_RESOURCE_URI, csp: UI_DECLARED_CSP },
						},
					},
					{
						name: WHOAMI_TOOL,
						title: 'Who am I (verified)',
						description:
							"Return the actor authenticated by the Hub's body-bound private dispatch assertion.",
						inputSchema: {
							type: 'object',
							properties: {},
						},
					},
					{
						name: BULK_EXPORT_TOOL,
						title: 'Bulk export HR records',
						description: 'Export records in bulk. Requires the Pro tier.',
						inputSchema: {
							type: 'object',
							properties: { records: { type: 'array', items: { type: 'object' } } },
							required: ['records'],
						},
					},
					{
						name: CREDENTIAL_CHECK_TOOL,
						title: 'Validate agent bot credential',
						description: "Confirm this app's configured agent bot credential authenticates against the Hub.",
						inputSchema: {
							type: 'object',
							properties: {},
						},
					},
					...APP_PLATFORM_TOOL_DEFINITIONS,
				],
			};

		case 'tools/call':
			if (params?.name === BULK_EXPORT_TOOL) {
				const records = Array.isArray(params?.arguments?.records) ? params.arguments.records : [];
				const guard = createLicenseGuard();
				guard.assert('bulk-export');
				guard.assertWithin('records', records.length);
				return { content: [{ type: 'text', text: JSON.stringify({ exported: records.length, records }) }] };
			}
			if (params?.name === WHOAMI_TOOL) {
				return handleWhoami(actor);
			}
			if (params?.name === CREDENTIAL_CHECK_TOOL) {
				return { content: [{ type: 'text', text: JSON.stringify(await checkAgentBotCredential()) }] };
			}
			if (params?.name === APP_OBJECT_STORE_TOOL) {
				return { content: [{ type: 'text', text: JSON.stringify(await handleAppObjectStoreTool(params?.arguments || {})) }] };
			}
			if (params?.name === APP_DB_STORE_TOOL) {
				return { content: [{ type: 'text', text: JSON.stringify(await handleAppDbStoreTool(params?.arguments || {})) }] };
			}
			if (params?.name !== TOOL_NAME) {
				throw new Error(`Unknown tool: ${params?.name || '<missing>'}`);
			}
			return {
				content: [
					{
						type: 'resource',
						resource: {
							uri: UI_RESOURCE_URI,
							mimeType: 'text/html;profile=mcp-app',
							text: getInlineUiHtml(),
						},
					},
				],
			};

		case 'resources/read':
			return {
				contents: [
					{
						uri: params?.uri || UI_RESOURCE_URI,
						mimeType: 'text/html;profile=mcp-app',
						text: getInlineUiHtml(),
					},
				],
			};

		default:
			throw new Error(`Unknown method: ${method}`);
	}
}

/**
 * Backend handler for the `hr_whoami` tool.
 *
 * `actor` is only ever the SDK-verified {@link VerifiedActor} the caller
 * (`http-server.ts` for Managed Direct HTTP, `relay-transport.ts` for Relay)
 * forwarded from `runtime-identity.ts` / `context.actor`. This function never
 * reads any plain, unverified caller-identity field (e.g. request
 * `_meta.privosUser.userId`) — those ride alongside the signed token but are
 * not proof of anything on their own, and there is intentionally no fallback
 * to them here. The iframe never receives or forwards a bearer/user token.
 */
async function handleWhoami(actor?: VerifiedActor): Promise<any> {
	const wrap = (obj: Record<string, any>) => ({ content: [{ type: 'text', text: JSON.stringify(obj) }] });
	if (!actor) {
		return wrap({
			verified: false,
			error: 'No verified caller identity is available for this request (no token presented, or verification failed).',
		});
	}
	const username = actor.username || actor.userId;
	return wrap({
		verified: true,
		username,
		userId: actor.userId,
		roomId: actor.roomId,
		provenance: actor.provenance,
		message: `Backend verified this request came from ${username} (${actor.userId}) via ${actor.provenance}.`,
		platform: describePlatformEnvironment(),
	});
}

/**
 * What the platform injected and what the operator configured — reported so an
 * end-to-end check can prove the environment actually reached the container.
 *
 * A secret is reported as SET or UNSET and never by value: this output travels
 * through the room, so printing the SMTP password — or the agent bot
 * credential — here would be exactly the leak the whole write-only path
 * exists to prevent. `PRIVOS_AGENT_BOT_CREDENTIAL` is written by a workspace
 * admin from Admin > Apps > this app > Settings, never by this app; this
 * backend only ever reads it from its own environment, the same as any other
 * declared secret.
 */
function describePlatformEnvironment(): Record<string, unknown> {
	const platform = getPlatformContext();
	return {
		publicUrl: platform.publicUrl ?? null,
		accessMode: platform.accessMode ?? null,
		mediaUrlExample: publicUrlFor('/public/icon.svg') ?? null,
		companyName: process.env.HRM_COMPANY_NAME ?? null,
		locale: process.env.HRM_LOCALE ?? 'en-US',
		smtpPasswordSet: Boolean(process.env.HRM_SMTP_PASSWORD),
		agentBotCredentialSet: Boolean(process.env.PRIVOS_AGENT_BOT_CREDENTIAL),
	};
}

/**
 * Build HTML referencing a live Vite dev server (HMR + TypeScript breakpoints).
 * Loads @vite/client and the React Fast Refresh preamble cross-origin from the
 * tunnel, then the real entry module — equivalent to what Vite injects into a
 * transformed index.html, but emitted here since the relay serves the document.
 */
function getDevUiHtml(publicUrl: string): string {
	const base = `${publicUrl}/ui`;
	return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
	  <title>${pkg.title || 'PrivOS Demo MCP App'} (dev)</title>
  <script type="module" src="${base}/@vite/client"></script>
  <script type="module">
    import RefreshRuntime from "${base}/@react-refresh";
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => (type) => type;
    window.__vite_plugin_react_preamble_installed__ = true;
  </script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="${base}/main.tsx"></script>
</body>
</html>`;
}

/**
 * Build a fully self-contained HTML page with inlined JS and CSS.
 * Reads from dist/ui/ (Vite build output). Run `npm run build` first.
 */
function getInlineUiHtml(): string {
	// Dev mode: serve live from the Vite dev server for HMR + breakpoints.
	if (devPublicUrl) return getDevUiHtml(devPublicUrl);

	const distDir = path.join(moduleDir, '../dist/ui');

	// In dev watch mode, check if build output changed since last cache
	const assetsPath = path.join(distDir, 'assets');
	if (fs.existsSync(assetsPath)) {
		const stat = fs.statSync(assetsPath);
		if (stat.mtimeMs !== lastBuildMtime) {
			cachedUiHtml = null;
			lastBuildMtime = stat.mtimeMs;
		}
	}

	if (cachedUiHtml) return cachedUiHtml;

	// Find built JS and CSS files in dist/ui/assets/
	const assetsDir = path.join(distDir, 'assets');
	if (!fs.existsSync(assetsDir)) {
		throw new Error('UI not built. Run `npm run build` first, then restart.');
	}

	const files = fs.readdirSync(assetsDir);
	const jsFile = files.find((f) => f.endsWith('.js'));
	const cssFile = files.find((f) => f.endsWith('.css'));

	const jsContent = jsFile ? fs.readFileSync(path.join(assetsDir, jsFile), 'utf-8') : '';
	const cssContent = cssFile ? fs.readFileSync(path.join(assetsDir, cssFile), 'utf-8') : '';

	cachedUiHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
	  <title>${pkg.title || 'PrivOS Demo MCP App'}</title>
  <style>${cssContent}</style>
</head>
<body>
  <div id="root"></div>
  <script type="module">${jsContent}</script>
</body>
</html>`;

	return cachedUiHtml;
}
