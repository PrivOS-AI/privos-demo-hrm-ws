/**
 * MCP JSON-RPC method handlers for the relay demo app.
 * UI is delivered fully inline via resources/read — no external URL references.
 * In production: reads built assets from dist/ui/ and embeds them in HTML.
 * In development: reads source and builds on-the-fly via Vite.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

import { getPlatformContext, publicUrlFor } from '@privos_ai/app-server';

import _pkg from '../privos-app.json';
import { createLicenseGuard } from './license';
const pkg = _pkg as Record<string, any>;
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const TOOL_NAME = 'hr_management_dashboard';
// Pure data (no UI) tool: returns the actor carried by the body-bound, Hub-signed
// private dispatch assertion verified before the request reaches this handler.
const WHOAMI_TOOL = 'hr_whoami';
const BULK_EXPORT_TOOL = 'hr_bulk_export';
const UI_RESOURCE_URI = 'ui://privos-mcp-app-demo/form.html';

/** Read icon as data URI from package.json icon path */
function getIconDataUri(): string | undefined {
	const iconPath = pkg.icon?.startsWith('/') ? path.join(moduleDir, '..', pkg.icon) : undefined;
	if (!iconPath || !fs.existsSync(iconPath)) return undefined;
	const ext = path.extname(iconPath).slice(1);
	const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
	const data = fs.readFileSync(iconPath).toString('base64');
	return `data:${mime};base64,${data}`;
}
const appIcon = getIconDataUri();

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

/** Handle an incoming MCP JSON-RPC request and return the result */
export async function handleMcpMessage(
	method: string,
	_id: number,
	params: any,
	dispatch?: { actor?: { subject: string; username?: string; roomId?: string } },
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
							ui: { resourceUri: UI_RESOURCE_URI },
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
				return handleWhoami(dispatch?.actor);
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
 * Production identity comes from the body-bound Hub dispatch assertion verified
 * by the workload SDK before this handler runs. The iframe never receives or
 * forwards a bearer/user token.
 */
async function handleWhoami(actor?: { subject: string; username?: string; roomId?: string }): Promise<any> {
	const wrap = (obj: Record<string, any>) => ({ content: [{ type: 'text', text: JSON.stringify(obj) }] });
	if (!actor) return wrap({ verified: false, error: 'Verified backend actor is unavailable in relay development compatibility mode.' });
	const username = actor.username || actor.subject;
	return wrap({
		verified: true,
		username,
		userId: actor.subject,
		roomId: actor.roomId,
		message: `Backend verified this request came from ${username} (${actor.subject}).`,
		platform: describePlatformEnvironment(),
	});
}

/**
 * What the platform injected and what the operator configured — reported so an
 * end-to-end check can prove the environment actually reached the container.
 *
 * A secret is reported as SET or UNSET and never by value: this output travels
 * through the room, so printing the SMTP password here would be exactly the
 * leak the whole write-only path exists to prevent.
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
