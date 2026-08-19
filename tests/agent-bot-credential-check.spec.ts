import { afterEach, describe, expect, it, vi } from 'vitest';

const { resolveHubOrigin } = vi.hoisted(() => ({ resolveHubOrigin: vi.fn() }));
vi.mock('../src/resolve-hub-origin', () => ({ resolveHubOrigin }));

// Obviously-fake fixture values — never a real secret — used to prove the
// credential never leaks through any return value or error path.
const FAKE_TOKEN = 'agent-bot-fake-token-not-a-real-secret-93f7';
const FAKE_USER_ID = 'fake-user-id-93f7';

afterEach(() => {
  delete process.env.PRIVOS_AGENT_BOT_CREDENTIAL;
  delete process.env.PRIVOS_AGENT_BOT_USER_ID;
  resolveHubOrigin.mockReset();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('checkAgentBotCredential', () => {
  it('reports not-configured when only the token is set', async () => {
    process.env.PRIVOS_AGENT_BOT_CREDENTIAL = FAKE_TOKEN;
    const { checkAgentBotCredential } = await import('../src/agent-bot-credential-check');
    await expect(checkAgentBotCredential()).resolves.toEqual({ status: 'not-configured' });
    expect(resolveHubOrigin).not.toHaveBeenCalled();
  });

  it('reports not-configured when only the user id is set', async () => {
    process.env.PRIVOS_AGENT_BOT_USER_ID = FAKE_USER_ID;
    const { checkAgentBotCredential } = await import('../src/agent-bot-credential-check');
    await expect(checkAgentBotCredential()).resolves.toEqual({ status: 'not-configured' });
    expect(resolveHubOrigin).not.toHaveBeenCalled();
  });

  it('reports hub-unreachable, not invalid, when the Hub origin cannot be resolved', async () => {
    process.env.PRIVOS_AGENT_BOT_CREDENTIAL = FAKE_TOKEN;
    process.env.PRIVOS_AGENT_BOT_USER_ID = FAKE_USER_ID;
    resolveHubOrigin.mockResolvedValue(undefined);
    const { checkAgentBotCredential } = await import('../src/agent-bot-credential-check');
    await expect(checkAgentBotCredential()).resolves.toEqual({ status: 'hub-unreachable' });
  });

  it('reports invalid with the HTTP status on a 401', async () => {
    process.env.PRIVOS_AGENT_BOT_CREDENTIAL = FAKE_TOKEN;
    process.env.PRIVOS_AGENT_BOT_USER_ID = FAKE_USER_ID;
    resolveHubOrigin.mockResolvedValue('https://hub.example');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })));
    const { checkAgentBotCredential } = await import('../src/agent-bot-credential-check');
    await expect(checkAgentBotCredential()).resolves.toEqual({ status: 'invalid', httpStatus: 401 });
  });

  it('reports valid with the bot identity from /api/v1/me on success', async () => {
    process.env.PRIVOS_AGENT_BOT_CREDENTIAL = FAKE_TOKEN;
    process.env.PRIVOS_AGENT_BOT_USER_ID = FAKE_USER_ID;
    resolveHubOrigin.mockResolvedValue('https://hub.example');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ _id: FAKE_USER_ID, username: 'demo-agent-bot' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { checkAgentBotCredential } = await import('../src/agent-bot-credential-check');
    await expect(checkAgentBotCredential()).resolves.toEqual({
      status: 'valid',
      botId: FAKE_USER_ID,
      username: 'demo-agent-bot',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://hub.example/api/v1/me');
    expect((init.headers as Record<string, string>)['x-auth-token']).toBe(FAKE_TOKEN);
    expect((init.headers as Record<string, string>)['x-user-id']).toBe(FAKE_USER_ID);
  });

  it('never returns, throws, or otherwise leaks the credential value on a network failure', async () => {
    process.env.PRIVOS_AGENT_BOT_CREDENTIAL = FAKE_TOKEN;
    process.env.PRIVOS_AGENT_BOT_USER_ID = FAKE_USER_ID;
    resolveHubOrigin.mockResolvedValue('https://hub.example');
    // A pathological error message embedding the token — proves the module
    // discards fetch's error entirely rather than reflecting any part of it.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(`ECONNREFUSED while sending ${FAKE_TOKEN}`)));
    const { checkAgentBotCredential } = await import('../src/agent-bot-credential-check');
    const result = await checkAgentBotCredential();
    expect(result).toEqual({ status: 'hub-unreachable' });
    expect(JSON.stringify(result)).not.toContain(FAKE_TOKEN);
  });

  it('never includes the credential value in a non-2xx result either', async () => {
    process.env.PRIVOS_AGENT_BOT_CREDENTIAL = FAKE_TOKEN;
    process.env.PRIVOS_AGENT_BOT_USER_ID = FAKE_USER_ID;
    resolveHubOrigin.mockResolvedValue('https://hub.example');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })));
    const { checkAgentBotCredential } = await import('../src/agent-bot-credential-check');
    const result = await checkAgentBotCredential();
    expect(JSON.stringify(result)).not.toContain(FAKE_TOKEN);
  });
});
