import { describe, expect, it } from 'vitest';
import { buildGenerateAsyncPayload, ATTEMPT_TERMINAL } from '../src/ui/bot-workload-helpers';

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

  it('includes operationId when a caller-stable idempotency key is supplied', () => {
    const payload = buildGenerateAsyncPayload({ ...base, operationId: 'op-1' });
    expect(payload).toMatchObject({ ...base, operationId: 'op-1' });
  });

  it('omits the operationId key entirely when none is supplied', () => {
    const payload = buildGenerateAsyncPayload(base);
    expect('operationId' in payload).toBe(false);
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
