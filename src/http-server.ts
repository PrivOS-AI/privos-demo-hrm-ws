import http from 'node:http';
import { createManifest } from './manifest';
import { handleMcpMessage } from './mcp-message-handlers';

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
        return sendJson(res, 200, { status: 'ok' });
      }
      if (req.method !== 'POST' || url.pathname !== '/mcp') {
        return sendJson(res, 404, { error: 'Not found' });
      }
      const message = await readJson(req);
      if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
        return sendJson(res, 400, { jsonrpc: '2.0', id: message.id ?? null, error: { code: -32600, message: 'Invalid Request' } });
      }
      try {
        const result = await handleMcpMessage(message.method, message.id, message.params);
        return sendJson(res, 200, { jsonrpc: '2.0', id: message.id ?? null, result });
      } catch (error: any) {
        return sendJson(res, 200, { jsonrpc: '2.0', id: message.id ?? null, error: { code: -32603, message: error?.message || 'Internal error' } });
      }
    } catch (error: any) {
      return sendJson(res, 400, { error: error?.message || 'Bad request' });
    }
  });
  server.listen(port, '0.0.0.0', () => console.log(`Direct MCP server listening on :${port}`));
  return server;
}
