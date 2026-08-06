import { describe, expect, it } from 'vitest';
import { handleMcpMessage } from '../src/mcp-message-handlers';

describe('JSON-RPC handlers', () => {
  it('initializes and lists tools', async () => {
    expect((await handleMcpMessage('initialize', 1, {})).serverInfo.name).toBeTruthy();
    const listed = await handleMcpMessage('tools/list', 2, {});
    expect(listed.tools.map((tool: any) => tool.name)).toContain('hr_bulk_export');
    const whoami = listed.tools.find((tool: any) => tool.name === 'hr_whoami');
    expect(whoami.inputSchema).toEqual({ type: 'object', properties: {} });
  });

  it('uses only a verified dispatch actor for backend identity', async () => {
    const unverified = await handleMcpMessage('tools/call', 3, { name: 'hr_whoami', arguments: {} });
    expect(JSON.parse(unverified.content[0].text)).toMatchObject({ verified: false });
    const verified = await handleMcpMessage(
      'tools/call',
      4,
      { name: 'hr_whoami', arguments: { userToken: 'ignored-browser-secret' } },
      {
        transport: 'direct',
        identityState: 'verified',
        sessionScope: 'test',
        roomId: 'room-1',
        actor: { userId: 'user-1', username: 'alice', roomId: 'room-1', claims: { sub: 'user-1', rid: 'room-1' } },
      },
    );
    expect(JSON.parse(verified.content[0].text)).toMatchObject({
      verified: true,
      userId: 'user-1',
      username: 'alice',
      roomId: 'room-1',
    });
    expect(verified.content[0].text).not.toContain('ignored-browser-secret');
  });
  it('calls the licensed tool on Pro', async () => {
    process.env.PRIVOS_APP_LICENSE = '{"tier":"pro","state":"active"}';
    const result = await handleMcpMessage('tools/call', 3, {
      name: 'hr_bulk_export', arguments: { records: [{ id: 1 }] },
    });
    delete process.env.PRIVOS_APP_LICENSE;
    expect(JSON.parse(result.content[0].text).exported).toBe(1);
  });
});
