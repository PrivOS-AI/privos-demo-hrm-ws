import { describe, expect, it } from 'vitest';

import { buildNotificationToolCall } from '../src/ui/notification-panel-model';

describe('buildNotificationToolCall', () => {
  it('builds the exact governed Hub tool call', () => {
    expect(buildNotificationToolCall({ userId: 'u1', title: 'Task ready', message: 'Review it' })).toEqual({
      name: 'mcpapp.notifications.create',
      arguments: { userId: 'u1', title: 'Task ready', message: 'Review it' },
    });
  });

  it('trims values and rejects missing required fields', () => {
    expect(buildNotificationToolCall({ userId: ' u1 ', title: ' Hi ', message: ' Body ' }).arguments).toEqual({
      userId: 'u1', title: 'Hi', message: 'Body',
    });
    expect(() => buildNotificationToolCall({ userId: '', title: 'Hi', message: 'Body' })).toThrow('userId is required');
  });
});
