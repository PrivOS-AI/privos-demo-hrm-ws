/**
 * MCP JSON-RPC method handlers for the relay demo app.
 * Same logic as the direct app's Express /mcp route, but extracted
 * as pure functions for use over WebSocket transport.
 */
import _pkg from '../package.json';
const pkg = _pkg as Record<string, any>;

const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:10002';

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
			return {}; // Acknowledged

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
						text: buildUiHtml(),
					},
				],
			};

		default:
			throw new Error(`Unknown method: ${method}`);
	}
}

/** Build the UI HTML that references the Vite dev server for HMR */
function buildUiHtml(): string {
	return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Demo HR Management (Relay)</title>
  <style>html,body{margin:0}</style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="${PUBLIC_URL}/ui/main.tsx"></script>
</body>
</html>`;
}
