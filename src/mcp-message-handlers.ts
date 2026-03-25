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

/** Cache the built UI HTML — invalidated when dist changes (dev watch mode) */
let cachedUiHtml: string | null = null;
let lastBuildMtime = 0;

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
				serverInfo: { name: pkg.title || pkg.name, version: pkg.version },
			};

		case 'notifications/initialized':
			return {};

		case 'tools/list':
			return {
				tools: [
					{
						name: 'hr_management_dashboard',
						title: pkg.title || 'Demo HR Management',
						description: pkg.description || 'HR management dashboard',
						inputSchema: {
							type: 'object',
							properties: { roomId: { type: 'string' } },
						},
						_meta: {
							ui: { resourceUri: 'ui://demo-hr-management/form.html' },
						},
					},
				],
			};

		case 'resources/read':
			return {
				contents: [
					{
						uri: params?.uri,
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
 * Build a fully self-contained HTML page with inlined JS and CSS.
 * Reads from dist/ui/ (Vite build output). Run `npm run build` first.
 */
function getInlineUiHtml(): string {
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
