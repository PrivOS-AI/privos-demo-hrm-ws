import { describe, expect, it } from 'vitest';
import { handleMcpMessage } from '../src/mcp-message-handlers';

describe('JSON-RPC handlers', () => {
  it('initializes and lists tools', async () => {
    expect((await handleMcpMessage('initialize', 1, {})).serverInfo.name).toBeTruthy();
    const listed = await handleMcpMessage('tools/list', 2, {});
    expect(listed.tools.map((tool: any) => tool.name)).toContain('hr_bulk_export');
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
