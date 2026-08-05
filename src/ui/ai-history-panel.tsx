/**
 * AI Chat History panel — browse the room's AI Chat sessions and read their
 * message history, all as the current user via the REST-first API.
 *
 * Requires scope `sandbox:ai-chat` (read-only). Endpoints:
 *   - list sessions: GET ai-messages.sessions?roomId
 *   - load history:  GET ai-messages.list?sessionId
 * A session flagged `hasActiveStream` is the one currently responding — its
 * history is the "live" conversation, the rest are older chats.
 */
import { useState, useEffect, useCallback } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import { restCall } from './privos-rest';
import MarkdownBlocks from './markdown-blocks';

interface ChatSession {
  _id: string;
  title?: string;
  messageCount?: number;
  hasActiveStream?: boolean;
}

interface AiMessage {
  _id: string;
  type: 'user' | 'ai';
  content: string;
  status?: string;
  createdAt?: string;
  user?: { name?: string; username?: string };
}

export default function AiHistoryPanel() {
  const app = usePrivosApp();
  const { roomId } = usePrivosContext();

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    if (!roomId) return;
    setLoadingSessions(true);
    setError(null);
    try {
      const res = await restCall<{ sessions: ChatSession[] }>(app, 'GET', 'ai-messages.sessions', {
        query: { roomId, count: 100 },
      });
      setSessions(Array.isArray(res.sessions) ? res.sessions : []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load sessions.');
    } finally {
      setLoadingSessions(false);
    }
  }, [app, roomId]);

  const loadMessages = useCallback(
    async (sessionId: string) => {
      setSelectedId(sessionId);
      setLoadingMessages(true);
      setError(null);
      try {
        const res = await restCall<{ messages: AiMessage[] }>(app, 'GET', 'ai-messages.list', {
          query: { sessionId, count: 200 },
        });
        setMessages(Array.isArray(res.messages) ? res.messages : []);
      } catch (err: any) {
        setError(err?.message || 'Failed to load history.');
      } finally {
        setLoadingMessages(false);
      }
    },
    [app],
  );

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  return (
    <div className="container history-container">
      <div className="history-head">
        <h1>AI Chat History</h1>
        <button type="button" className="btn-new-list" onClick={loadSessions} disabled={loadingSessions}>
          {loadingSessions ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="history-layout">
        <div className="history-sessions">
          {sessions.length === 0 && !loadingSessions && <p className="empty-text">No AI Chat sessions in this room yet.</p>}
          {sessions.map((s) => (
            <button
              key={s._id}
              type="button"
              className={`history-session${selectedId === s._id ? ' history-session-active' : ''}`}
              onClick={() => loadMessages(s._id)}
            >
              <span className="history-session-title">{s.title?.trim() || 'Untitled chat'}</span>
              <span className="history-session-meta">
                {typeof s.messageCount === 'number' ? `${s.messageCount} msg` : ''}
                {s.hasActiveStream && <span className="history-live">live</span>}
              </span>
            </button>
          ))}
        </div>

        <div className="history-messages">
          {!selectedId && <p className="empty-text">Select a session to view its history.</p>}
          {selectedId && loadingMessages && <p className="empty-text">Loading history…</p>}
          {selectedId && !loadingMessages && messages.length === 0 && <p className="empty-text">This session has no messages.</p>}
          {selectedId &&
            !loadingMessages &&
            messages.map((m) => (
              <div key={m._id} className={`chat-msg chat-${m.type === 'user' ? 'user' : 'assistant'}`}>
                <div className="chat-bubble">
                  {m.type === 'ai' ? <MarkdownBlocks text={m.content || ''} /> : m.content}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
