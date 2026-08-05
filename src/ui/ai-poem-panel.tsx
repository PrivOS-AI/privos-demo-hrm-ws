/**
 * AI Poem panel — a focused demo of the room's native AI on top of the same
 * ai-messages REST flow the AI Chat tab uses. The user types a command/topic;
 * we ask the AI to compose a poem and return it as JSON `{ title, content }`,
 * poll the session until the reply completes, parse it, and render a poem card.
 *
 * Flow (all as the current user):
 *   1. POST ai-messages.send { entityType:'room-chat', ... content } -> { aiMessage, sessionId }
 *   2. POST ai-messages.startGeneration { messageId }
 *   3. GET  ai-messages.list?sessionId (poll) until the AI message is terminal
 *
 * Each request runs a fresh session so every command yields a standalone poem.
 */
import { useState, useCallback } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import { restCall } from './privos-rest';

interface ServerMessage {
  _id: string;
  type: 'user' | 'ai';
  content: string;
  status?: string;
}

interface Poem {
  title: string;
  content: string;
}

const POLL_INTERVAL_MS = 1200;
const POLL_MAX_TRIES = 300; // ~6 min ceiling at 1.2s/poll
const AI_TERMINAL = new Set(['completed', 'failed', 'cancelled']);
const SEND_TIMEOUT_MS = 60000;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Build the instruction that steers the AI toward a JSON poem response. */
function buildPrompt(command: string): string {
  return (
    `Write an original short poem based on this request: "${command}".\n\n` +
    `Respond with ONLY a JSON object (no prose, no code fences) of the exact shape:\n` +
    `{"title": "<a fitting poem title>", "content": "<the full poem, with \\n between lines>"}`
  );
}

/** Extract a { title, content } poem from the AI's raw reply.
 *  Prefers a JSON object; falls back to first-line-as-title heuristic. */
function parsePoem(raw: string): Poem | null {
  const text = (raw || '').trim();
  if (!text) return null;

  // Try the first {...} block, tolerating stray prose or ```json fences.
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const obj = JSON.parse(text.slice(start, end + 1));
      const title = typeof obj.title === 'string' ? obj.title.trim() : '';
      const content = typeof obj.content === 'string' ? obj.content.trim() : '';
      if (title || content) return { title: title || 'Untitled', content };
    } catch {
      /* fall through to heuristic */
    }
  }

  // Fallback: treat the first non-empty line as the title, the rest as body.
  const lines = text.split('\n');
  const first = lines.findIndex((l) => l.trim().length > 0);
  if (first === -1) return null;
  return {
    title: lines[first].replace(/^#+\s*/, '').trim() || 'Untitled',
    content: lines.slice(first + 1).join('\n').trim(),
  };
}

export default function AiPoemPanel() {
  const app = usePrivosApp();
  const { roomId } = usePrivosContext();

  const [command, setCommand] = useState('');
  const [busy, setBusy] = useState(false);
  // The generated poem lands in these editable fields (title input + body textarea).
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [hasResult, setHasResult] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    const cmd = command.trim();
    if (!cmd || !roomId || busy) return;
    setBusy(true);
    setError(null);
    setHasResult(false);
    try {
      const sent = await restCall<{ aiMessage?: { _id: string }; sessionId: string }>(
        app,
        'POST',
        'ai-messages.send',
        {
          body: {
            entityType: 'room-chat',
            entityId: roomId,
            roomId,
            flowChatId: roomId,
            content: buildPrompt(cmd),
          },
          timeoutMs: SEND_TIMEOUT_MS,
        },
      );
      const aiMessageId = sent.aiMessage?._id;
      if (aiMessageId) {
        await restCall(app, 'POST', 'ai-messages.startGeneration', { body: { messageId: aiMessageId } });
      }

      for (let i = 0; i < POLL_MAX_TRIES; i++) {
        await delay(POLL_INTERVAL_MS);
        const res = await restCall<{ messages: ServerMessage[] }>(app, 'GET', 'ai-messages.list', {
          query: { sessionId: sent.sessionId, count: 50 },
        });
        const list = Array.isArray(res.messages) ? res.messages : [];
        const lastAi = [...list].reverse().find((m) => m.type === 'ai');
        if (lastAi && AI_TERMINAL.has(lastAi.status || '')) {
          if (lastAi.status === 'failed') throw new Error('The AI could not generate a poem. Try again.');
          const parsed = parsePoem(lastAi.content);
          if (!parsed) throw new Error('The AI returned an empty response.');
          setTitle(parsed.title);
          setContent(parsed.content);
          setHasResult(true);
          return;
        }
      }
      throw new Error('Timed out waiting for the poem.');
    } catch (err: any) {
      setError(err?.message || 'Failed to generate the poem.');
    } finally {
      setBusy(false);
    }
  }, [app, roomId, command, busy]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      generate();
    }
  }

  return (
    <div className="container chat-container">
      <h1>AI Poem</h1>
      <p className="empty-text">
        Enter a command — a topic, mood, or theme — and the AI will suggest a poem title and content.
      </p>

      <div className="chat-input-row">
        <textarea
          className="chat-input"
          rows={3}
          value={command}
          placeholder='e.g. "a rainy morning in Hanoi", Enter to generate'
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={busy}
        />
        <button type="button" className="btn-submit" onClick={generate} disabled={busy || !command.trim()}>
          {busy ? 'Composing…' : 'Generate poem'}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {hasResult && (
        <div className="poem-result">
          <label className="poem-field">
            <span className="poem-field-label">Title</span>
            <input
              type="text"
              className="poem-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="poem-field">
            <span className="poem-field-label">Poem</span>
            <textarea
              className="poem-content-input"
              rows={12}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </label>
        </div>
      )}
    </div>
  );
}
