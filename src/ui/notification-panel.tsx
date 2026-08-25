import { useState } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';

import { buildNotificationToolCall } from './notification-panel-model';

type CreateResult = { notificationId: string; userId: string; roomId: string; type: string };

function parseCreateResult(value: unknown): CreateResult {
  const text = (value as { content?: Array<{ text?: string }> })?.content?.[0]?.text;
  return (typeof text === 'string' ? JSON.parse(text) : value) as CreateResult;
}

export default function NotificationPanel() {
  const app = usePrivosApp();
  const { userId } = usePrivosContext();
  const [targetUserId, setTargetUserId] = useState(userId || '');
  const [title, setTitle] = useState('Notification from MCP App Demo');
  const [message, setMessage] = useState('This notification was created through mcpapp.notifications.create.');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendNotification() {
    setSending(true);
    setError(null);
    setResult(null);
    try {
      // notifications:write — Hub validates that this user belongs to the exact
      // room authorization binding; the app cannot choose a different room.
      const call = buildNotificationToolCall({ userId: targetUserId, title, message });
      setResult(parseCreateResult(await app.callServerTool(call)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="container">
      <h1>Notification</h1>
      <p>Send one bell, native mobile, and Web Push notification to a user in this approved room.</p>
      <label className="form-field">
        <span>Target user ID</span>
        <input value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)} placeholder="User ID in this room" />
      </label>
      <label className="form-field">
        <span>Title</span>
        <input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label className="form-field">
        <span>Message</span>
        <textarea value={message} maxLength={1000} rows={4} onChange={(event) => setMessage(event.target.value)} />
      </label>
      <button type="button" className="primary-btn" disabled={sending} onClick={() => void sendNotification()}>
        {sending ? 'Sending…' : 'Send notification'}
      </button>
      {error && <div className="error-message" role="alert">{error}</div>}
      {result && <div className="success-message" role="status">Created notification <code>{result.notificationId}</code> for <code>{result.userId}</code>.</div>}
    </div>
  );
}
