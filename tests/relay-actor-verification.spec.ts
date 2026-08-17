import { describe, expect, it } from 'vitest';

import type { ApplicationMcpRequest, ToolCallContext, VerifiedActor } from '@privos_ai/app-server';

import { relayMcpHandler } from '../src/relay-transport';

/**
 * `relayMcpHandler` is the adapter between the SDK's `AppMcpHandler` contract
 * (invoked by `connectRelay` for both `development` relay pairing and
 * `standalone-production`) and this app's `handleMcpMessage`. These tests
 * prove the adapter forwards exactly what the SDK verified — nothing more,
 * nothing less — without booting a real WebSocket relay connection.
 */

function whoamiRequest(id = 1): ApplicationMcpRequest {
  return { jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'hr_whoami', arguments: {} } };
}

function baseContext(overrides: Partial<ToolCallContext> = {}): ToolCallContext {
  return {
    transport: 'relay',
    identityState: 'missing',
    sessionScope: 'test-scope',
    ...overrides,
  };
}

describe('relayMcpHandler actor wiring', () => {
  it('forwards a verified relay actor (user-token provenance) to hr_whoami', async () => {
    const actor: VerifiedActor = Object.freeze({
      userId: 'user-1',
      username: 'techcomthanh',
      roomId: 'room-1',
      claims: Object.freeze({ sub: 'user-1', rid: 'room-1' }),
      provenance: 'user-token',
    });
    const context = baseContext({ identityState: 'verified', actor, roomId: 'room-1' });

    const result: any = await relayMcpHandler(whoamiRequest(), context);

    expect(JSON.parse(result.content[0].text)).toMatchObject({
      verified: true,
      userId: 'user-1',
      username: 'techcomthanh',
      roomId: 'room-1',
      provenance: 'user-token',
    });
  });

  it('reports unverified when no token was presented (identityState: missing)', async () => {
    const context = baseContext({ identityState: 'missing' });

    const result: any = await relayMcpHandler(whoamiRequest(), context);

    expect(JSON.parse(result.content[0].text)).toMatchObject({ verified: false });
  });

  it('reports unverified when the token failed verification (identityState: invalid), never throws', async () => {
    const context = baseContext({ identityState: 'invalid' });

    const result: any = await relayMcpHandler(whoamiRequest(), context);

    expect(JSON.parse(result.content[0].text)).toMatchObject({ verified: false });
  });

  it('never falls back to the plain, unverified _meta.privosUser fields when context.actor is absent', async () => {
    // A malicious or buggy caller could put anything here; only `context.actor`
    // — populated solely by the SDK's own JWKS-verified user-token check — may
    // ever name a caller. `relayMcpHandler` must not read `request.params`
    // for identity at all.
    const request: ApplicationMcpRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'hr_whoami',
        arguments: {},
        _meta: { privosUser: { userId: 'attacker-claimed-id', username: 'root', userToken: 'not-a-real-jwt' } },
      },
    };
    const context = baseContext({ identityState: 'invalid' });

    const result: any = await relayMcpHandler(request, context);

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toMatchObject({ verified: false });
    expect(JSON.stringify(parsed)).not.toContain('attacker-claimed-id');
    expect(JSON.stringify(parsed)).not.toContain('root');
  });
});
