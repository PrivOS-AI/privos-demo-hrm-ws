import { describe, expect, it } from 'vitest';
import {
  mapCredentialIssueError,
  extractIssuanceEvidence,
  buildGenerateAsyncPayload,
  ATTEMPT_TERMINAL,
} from '../src/ui/bot-workload-helpers';

describe('mapCredentialIssueError', () => {
  it('maps BOT_CREDENTIAL_ISSUE_DENIED and BOT_CREDENTIAL_ISSUE_DISABLED to distinct messages', () => {
    const denied = mapCredentialIssueError(new Error('BOT_CREDENTIAL_ISSUE_DENIED'));
    const disabled = mapCredentialIssueError(new Error('BOT_CREDENTIAL_ISSUE_DISABLED'));
    expect(denied).not.toBe(disabled);
    expect(denied).toMatch(/not authorized/i);
    expect(disabled).toMatch(/turned off/i);
  });

  it('falls back to the raw message for an unrecognized error', () => {
    expect(mapCredentialIssueError(new Error('something else'))).toBe('something else');
    expect(mapCredentialIssueError('not an Error instance')).toBe('not an Error instance');
  });
});

describe('extractIssuanceEvidence', () => {
  it('never returns the credential value, only issuedAt', () => {
    const result = { botId: 'bot-1', username: 'demo', credential: 'top-secret-value', issuedAt: '2026-08-11T00:00:00.000Z' };
    const evidence = extractIssuanceEvidence(result);
    expect(evidence).toEqual({ issuedAt: '2026-08-11T00:00:00.000Z' });
    expect(Object.keys(evidence)).toEqual(['issuedAt']);
    expect(JSON.stringify(evidence)).not.toContain('top-secret-value');
  });

  it('returns null issuedAt when missing or malformed', () => {
    expect(extractIssuanceEvidence({})).toEqual({ issuedAt: null });
    expect(extractIssuanceEvidence({ issuedAt: 12345 as unknown as string })).toEqual({ issuedAt: null });
  });
});

describe('buildGenerateAsyncPayload', () => {
  const base = { roomId: 'room-1', prompt: 'hello', taskId: 'task-1', taskTitle: 'Task One' };

  it('includes botId when an executor is selected', () => {
    const payload = buildGenerateAsyncPayload({ ...base, botId: 'bot-42' });
    expect(payload).toMatchObject({ roomId: 'room-1', prompt: 'hello', taskId: 'task-1', taskTitle: 'Task One', botId: 'bot-42' });
  });

  it('omits the botId key entirely when no executor is selected', () => {
    const payload = buildGenerateAsyncPayload(base);
    expect('botId' in payload).toBe(false);
  });

  it('never includes a projectId key — the Hub always derives it from the executor', () => {
    const withExecutor = buildGenerateAsyncPayload({ ...base, botId: 'bot-42' });
    const withoutExecutor = buildGenerateAsyncPayload(base);
    expect('projectId' in withExecutor).toBe(false);
    expect('projectId' in withoutExecutor).toBe(false);
  });
});

describe('ATTEMPT_TERMINAL', () => {
  it('treats completed/failed/cancelled/unknown as terminal and running as not', () => {
    expect(ATTEMPT_TERMINAL.has('completed')).toBe(true);
    expect(ATTEMPT_TERMINAL.has('failed')).toBe(true);
    expect(ATTEMPT_TERMINAL.has('cancelled')).toBe(true);
    expect(ATTEMPT_TERMINAL.has('unknown')).toBe(true);
    expect(ATTEMPT_TERMINAL.has('running')).toBe(false);
  });
});
