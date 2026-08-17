import http from 'node:http';
import { createManifest } from './manifest';
import { handleMcpMessage } from './mcp-message-handlers';
import { runtimeReadiness, verifyInboundDispatch } from './runtime-identity';

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readJson(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 1024 * 1024) throw new Error('Request body exceeds 1 MiB');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

export function startHttpServer(port = Number(process.env.PORT || 3000)) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/.well-known/mcp/manifest.json') {
        return sendJson(res, 200, createManifest());
      }
      if (req.method === 'GET' && url.pathname === '/health') {
        return sendJson(res, 200, { status: 'alive', processRunning: true });
      }
      if (req.method === 'GET' && url.pathname === '/ready') {
        const readiness = await runtimeReadiness();
        const ready = readiness.manifestVerified
          && (readiness.mode === 'development' || (readiness.identityPaired && readiness.activeAuthorization));
        return sendJson(res, ready ? 200 : 503, { status: ready ? 'ready' : 'not_ready', ...readiness });
      }
      if (req.method !== 'POST' || url.pathname !== '/mcp') {
        return sendJson(res, 404, { error: 'Not found' });
      }
      const message = await readJson(req);
      if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
        return sendJson(res, 400, { jsonrpc: '2.0', id: message.id ?? null, error: { code: -32600, message: 'Invalid Request' } });
      }
      const assertionHeader = Array.isArray(req.headers['x-privos-dispatch-assertion'])
        ? req.headers['x-privos-dispatch-assertion'][0]
        : req.headers['x-privos-dispatch-assertion'];
      let dispatch;
      try {
        dispatch = await verifyInboundDispatch(message, assertionHeader);
      } catch {
        return sendJson(res, 403, {
          jsonrpc: '2.0',
          id: message.id ?? null,
          error: { code: -32600, message: 'Authenticated private dispatch required', data: { code: 'DISPATCH_ASSERTION_INVALID' } },
        });
      }
      try {
        const result = await handleMcpMessage(message.method, message.id, message.params, dispatch?.actor);
        return sendJson(res, 200, { jsonrpc: '2.0', id: message.id ?? null, result });
      } catch {
        // Never reflect application exception text: request parameters may contain
        // private content and runtime errors must not become a credential oracle.
        return sendJson(res, 200, { jsonrpc: '2.0', id: message.id ?? null, error: { code: -32603, message: 'Request failed' } });
      }
    } catch (error: any) {
      return sendJson(res, 400, { error: error?.message || 'Bad request' });
    }
  });
  server.listen(port, '0.0.0.0', () => console.log(`Direct MCP server listening on :${port}`));
  return server;
}
