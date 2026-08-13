import { describe, expect, it } from 'vitest';
import type { McpApp } from '@privos_ai/app-react';
import { isBotKeyOutdatedError, AUTO_PUSH_SPENT_CODE, BOT_KEY_OUTDATED_CODE } from '../src/ui/botkey-autopush-controller';
import { OptionalFeatureUnavailableError, PrivosRestError, restCall } from '../src/ui/privos-rest';

/** Minimal stand-in for the SDK app object — only `rest` is exercised here. */
function fakeApp(response: { statusCode: number; body: unknown }): McpApp {
  return { rest: async () => response } as unknown as McpApp;
}

describe('coded hub failures', () => {
  it('carries the hub error code through to the caller', async () => {
    const app = fakeApp({ statusCode: 400, body: { success: false, error: 'nope', errorType: AUTO_PUSH_SPENT_CODE } });

    await expect(restCall(app, 'POST', 'agents.sandbox.pushBotKey')).rejects.toMatchObject({
      code: AUTO_PUSH_SPENT_CODE,
      message: 'nope',
    });
  });

  it('still throws plainly when the hub sent no code', async () => {
    const app = fakeApp({ statusCode: 400, body: { success: false, error: 'nope' } });

    await expect(restCall(app, 'POST', 'agents.sandbox.pushBotKey')).rejects.toMatchObject({ code: undefined });
  });
});

describe('isBotKeyOutdatedError', () => {
  it('recognises the hub classifying a refused bot key', () => {
    expect(isBotKeyOutdatedError(new PrivosRestError('refused', 400, BOT_KEY_OUTDATED_CODE))).toBe(true);
  });

  it('does not treat prose as a classification', () => {
    // Matching the message would fire on any failure that merely mentions the
    // key, and would break the moment the hub reworded its copy.
    expect(isBotKeyOutdatedError(new Error('attempt failed: bot-key-outdated'))).toBe(false);
    expect(isBotKeyOutdatedError(new PrivosRestError('bot-key-outdated', 400))).toBe(false);
  });

  it('ignores unrelated failures', () => {
    expect(isBotKeyOutdatedError(new PrivosRestError('busy', 400, 'project-busy'))).toBe(false);
    expect(isBotKeyOutdatedError(new OptionalFeatureUnavailableError())).toBe(false);
    expect(isBotKeyOutdatedError(undefined)).toBe(false);
  });
});
