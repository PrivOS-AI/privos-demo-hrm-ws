/**
 * MCP JSON-RPC method handlers for the relay demo app.
 * UI is delivered fully inline via resources/read — no external URL references.
 * In production: reads built assets from dist/ui/ and embeds them in HTML.
 * In development: reads source and builds on-the-fly via Vite.
 */
import fs from 'fs';
import path from 'path';

import _pkg from '../package.json';
const pkg = _pkg as Record<string, any>;
const TOOL_NAME = 'hr_management_dashboard';
const UI_RESOURCE_URI = 'ui://demo-hr-management/form.html';

/** Read icon as data URI from package.json icon path */
function getIconDataUri(): string | undefined {
	const iconPath = pkg.icon?.startsWith('/') ? path.join(__dirname, '..', pkg.icon) : undefined;
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
export function handleMcpMessage(method: string, _id: number, params: any): any {
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
				// Advertise the manifest's requested scopes so the hub can refresh
				// `requestedScopes` on reconnect/refresh without a re-pair.
				...(Array.isArray(pkg.scopes) && { scopes: pkg.scopes }),
			},
			};

		case 'notifications/initialized':
			return {};

		case 'tools/list':
			return {
				tools: [
					{
						name: TOOL_NAME,
						title: pkg.title || 'Demo HR Management',
						description: pkg.description || 'HR management dashboard',
						inputSchema: {
							type: 'object',
							properties: { roomId: { type: 'string' } },
						},
						_meta: {
							ui: { resourceUri: UI_RESOURCE_URI },
						},
					},
				],
			};

		case 'tools/call':
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
  <title>${pkg.title || 'Demo HR Management'} (dev)</title>
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

	const distDir = path.join(__dirname, '../dist/ui');

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
  <title>${pkg.title || 'Demo HR Management'}</title>
  <style>${cssContent}</style>
</head>
<body>
  <div id="root"></div>
  <script type="module">${jsContent}</script>
</body>
</html>`;

	return cachedUiHtml;
}
