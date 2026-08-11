import { describe, expect, it } from 'vitest';
import { restCall, OptionalFeatureUnavailableError } from '../src/ui/privos-rest';

function fakeApp(response: { statusCode: number; body: any }) {
  return { rest: async () => response } as any;
}

describe('restCall', () => {
  it('surfaces the Hub error detail on a >=400 status instead of a bare status code', async () => {
    const app = fakeApp({ statusCode: 400, body: { success: false, error: 'Task is already bound to a different executor bot (bot-1)' } });
    await expect(restCall(app, 'POST', 'agents.sandbox.generate-async', {})).rejects.toThrow(
      'Task is already bound to a different executor bot (bot-1)',
    );
  });

  it('surfaces the Hub error detail on a 200 success:false body', async () => {
    const app = fakeApp({ statusCode: 200, body: { success: false, error: 'Invalid bot: no active token (bot was not provisioned correctly)' } });
    await expect(restCall(app, 'POST', 'ai-messages.send', {})).rejects.toThrow(
      'Invalid bot: no active token (bot was not provisioned correctly)',
    );
  });

  it('falls back to a generic message when no detail is present', async () => {
    const app = fakeApp({ statusCode: 500, body: {} });
    await expect(restCall(app, 'GET', 'some.route', {})).rejects.toThrow('Request failed (500)');
  });

  it('always raises OptionalFeatureUnavailableError on 403, regardless of body content', async () => {
    const app = fakeApp({ statusCode: 403, body: { success: false, error: 'ignored on 403' } });
    await expect(restCall(app, 'GET', 'some.route', {})).rejects.toBeInstanceOf(OptionalFeatureUnavailableError);
  });

  it('resolves normally on success', async () => {
    const app = fakeApp({ statusCode: 200, body: { success: true, attemptId: 'attempt-1' } });
    await expect(restCall(app, 'GET', 'some.route', {})).resolves.toEqual({ success: true, attemptId: 'attempt-1' });
  });
});
