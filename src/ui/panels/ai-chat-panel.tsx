/**
 * AI Chat panel — the room's **native** AI Chat, driven over REST-first so the
 * conversation persists as AIChatSession/AIMessage rows (browsable in the AI
 * History tab) and the pending/generating reply is visible while it streams.
 *
 * Flow (all as the current user):
 *   0. (optional) app.uploadFile() -> { file: { _id } }                       [files:write]
 *   1. POST ai-messages.send { entityType:'room-chat', entityId:roomId, roomId,
 *      flowChatId:roomId, content, fileIds?, sessionId?, botId? } -> { aiMessage, sessionId }
 *      (creates the session on first send; stages the worker job)            [sandbox:ai-chat:write]
 *   2. POST ai-messages.startGeneration { messageId: aiMessage._id }         [sandbox:ai-chat:write]
 *   3. GET  ai-messages.list?sessionId  (poll) -> messages w/ live content   [sandbox:ai-chat]
 *   4. POST ai-messages.cancel { messageId } — Stop button; aborts the run   [sandbox:ai-chat:write]
 *
 * Each AI message carries `content` (streamed text) plus `toolUses` — the
 * structured response blocks — which we render as cards + a JSON view.
 *
 * `botId` is optional and picks the agent that answers (see
 * `ai-chat-executor-select.tsx` and `ai-chat-bot-selection.ts`): omitting it
 * keeps the room-default-bot behavior byte-identical to before this existed.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { usePrivosApp, usePrivosContext, parseToolResult } from '@privos_ai/app-react';
import { restCall } from '../privos-rest';
import { buildSendMessageBody, isInstallationBotProvisioningError } from '../ai-chat-bot-selection';
import AiChatExecutorSelect from '../ai-chat-executor-select';
import MarkdownBlocks from './markdown-blocks';

interface ToolUse {
  toolId?: string;
  toolName?: string;
  input?: any;
}

interface ServerMessage {
  _id: string;
  type: 'user' | 'ai';
  content: string;
  status?: string;
  toolUses?: ToolUse[];
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  streaming?: boolean;
  toolUses?: ToolUse[];
}

interface Attachment {
  fileId: string;
  name: string;
}

const POLL_INTERVAL_MS = 1200;
const POLL_MAX_TRIES = 500; // ~10 min ceiling at 1.2s/poll
// AIMessageStatus terminal values (see hub IAIMessage.ts).
const AI_TERMINAL = new Set(['completed', 'failed', 'cancelled']);
const UPLOAD_TIMEOUT_MS = 60000;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const readAsDataUri = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

/** Map the native session message list into renderable chat messages. */
function mapMessages(list: ServerMessage[]): ChatMessage[] {
  return list.map((m) => ({
    id: m._id,
    role: m.type === 'user' ? 'user' : 'assistant',
    text: m.content || '',
    streaming: m.type === 'ai' && !AI_TERMINAL.has(m.status || ''),
    toolUses: Array.isArray(m.toolUses) ? m.toolUses : undefined,
  }));
}

/** Render an assistant reply: streamed text + structured tool-use blocks. */
function AssistantBlocks({ m }: { m: ChatMessage }) {
  const tools = m.toolUses || [];
  return (
    <>
      {m.text ? <MarkdownBlocks text={m.text} /> : m.streaming ? <span className="chat-thinking">Thinking…</span> : null}
      {tools.map((t, i) => (
        <div key={i} className="agent-block agent-block-tool">
          <div className="agent-block-label">Tool · {t.toolName || 'unknown'}</div>
          {t.input !== undefined && t.input !== null && (
            <pre className="agent-block-pre">{typeof t.input === 'string' ? t.input : JSON.stringify(t.input, null, 2)}</pre>
          )}
        </div>
      ))}
      {tools.length > 0 && (
        <details className="chat-json-block">
          <summary>Structured JSON response ({tools.length} block{tools.length === 1 ? '' : 's'})</summary>
          <pre className="chat-json-pre"><code>{JSON.stringify(tools, null, 2)}</code></pre>
        </details>
      )}
      {m.streaming && m.text && <span className="chat-streaming-caret">▌</span>}
    </>
  );
}

export default function AiChatPanel() {
  const app = usePrivosApp();
  const { roomId, effectiveScopes } = usePrivosContext();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // The in-flight assistant message id (target of ai-messages.cancel), and a
  // flag the poll loop checks so a Stop breaks out immediately instead of
  // waiting for the next terminal-status poll.
  const currentAiIdRef = useRef<string | null>(null);
  const stoppedRef = useRef(false);
  const [stopping, setStopping] = useState(false);
  // Mirror of currentAiIdRef existence, purely to drive the Stop button's
  // enabled state (a ref change doesn't re-render).
  const [hasInflight, setHasInflight] = useState(false);

  // Executor selection (see ai-chat-executor-select.tsx). 'default' sends no
  // botId at all — the exact pre-existing payload. The installation bot's
  // identity is a best-effort lookup: if it hasn't joined this Room yet, or
  // bot:identity:read isn't granted, only the default option is offered.
  const [executor, setExecutor] = useState<'default' | 'installation'>('default');
  const [botIdentity, setBotIdentity] = useState<{ botId: string; username: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!roomId || effectiveScopes?.includes('bot:identity:read') !== true) return;
    (async () => {
      try {
        const raw = await app.callServerTool({ name: 'mcpapp.bot.getCurrentRoomIdentity', arguments: {} });
        const identity = parseToolResult(raw) as { botId?: string; username?: string };
        if (!cancelled && identity?.botId && identity?.username) {
          setBotIdentity({ botId: identity.botId, username: identity.username });
        }
      } catch {
        // Expected when no installation bot exists yet, or it hasn't joined
        // this Room — the selector simply omits the installation option.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [app, roomId, effectiveScopes]);

  const selectedBotId = executor === 'installation' && botIdentity ? botIdentity.botId : undefined;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const onPickFile = useCallback(
    async (file: File | null) => {
      if (!file || !roomId) return;
      setUploading(true);
      setError(null);
      try {
        const dataUri = await readAsDataUri(file);
        const res: any = await app.uploadFile({
          channelId: roomId,
          fileName: file.name,
          base64Data: dataUri,
          mimeType: file.type || 'application/octet-stream',
        });
        const fileId = res?.file?._id || res?.file?.id;
        if (!fileId) throw new Error('Upload returned no file id.');
        setAttachment({ fileId, name: file.name });
      } catch (err: any) {
        setError(err?.message || 'Attach failed.');
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = '';
      }
    },
    [app, roomId],
  );

  const pollSession = useCallback(
    async (sessionId: string) => {
      for (let i = 0; i < POLL_MAX_TRIES; i++) {
        await delay(POLL_INTERVAL_MS);
        if (stoppedRef.current) return; // Stop pressed — quit polling.
        const res = await restCall<{ messages: ServerMessage[] }>(app, 'GET', 'ai-messages.list', {
          query: { sessionId, count: 200 },
        });
        const list = Array.isArray(res.messages) ? res.messages : [];
        setMessages(mapMessages(list));
        const lastAi = [...list].reverse().find((m) => m.type === 'ai');
        if (lastAi && AI_TERMINAL.has(lastAi.status || '')) return;
      }
    },
    [app],
  );

  const send = useCallback(async () => {
    const content = input.trim();
    if ((!content && !attachment) || !roomId || busy) return;
    setInput('');
    setError(null);
    const sentAttachment = attachment;
    setAttachment(null);
    setMessages((m) => [
      ...m,
      { id: `tmp-user-${Date.now()}`, role: 'user', text: content || `📎 ${sentAttachment?.name || 'file'}` },
      { id: `tmp-ai-${Date.now()}`, role: 'assistant', text: '', streaming: true },
    ]);
    setBusy(true);
    stoppedRef.current = false;
    currentAiIdRef.current = null;
    setHasInflight(false);
    try {
      const sent = await restCall<{ aiMessage?: { _id: string }; sessionId: string }>(app, 'POST', 'ai-messages.send', {
        body: buildSendMessageBody({
          roomId,
          content: content || 'Summarise the attached file.',
          fileId: sentAttachment?.fileId,
          sessionId: sessionIdRef.current,
          botId: selectedBotId,
        }),
        timeoutMs: UPLOAD_TIMEOUT_MS,
      });
      sessionIdRef.current = sent.sessionId;
      const aiMessageId = sent.aiMessage?._id;
      currentAiIdRef.current = aiMessageId || null; // Stop targets this message.
      setHasInflight(!!aiMessageId);
      if (aiMessageId) {
        await restCall(app, 'POST', 'ai-messages.startGeneration', { body: { messageId: aiMessageId } });
      }
      await pollSession(sent.sessionId);
    } catch (err: any) {
      // The installation bot has no AI Chat token by design (see
      // ai-chat-bot-selection.ts) — name that plainly instead of the raw
      // Hub error, which is written for a developer, not this UI.
      setError(
        selectedBotId && isInstallationBotProvisioningError(err)
          ? 'The installation bot has no AI Chat token yet — it can run as a Sandbox executor, but not as an AI Chat agent.'
          : err?.message || 'Failed to send message.',
      );
      setMessages((m) => m.filter((x) => !x.id.startsWith('tmp-')));
    } finally {
      setBusy(false);
      currentAiIdRef.current = null;
      setHasInflight(false);
    }
  }, [app, roomId, input, attachment, busy, pollSession, selectedBotId]);

  /** Stop the in-flight run: abort on the server, break the poll loop, and
   *  refresh the list once so the cancelled reply (with partial text) shows. */
  const stop = useCallback(async () => {
    const messageId = currentAiIdRef.current;
    const sessionId = sessionIdRef.current;
    if (!messageId || stopping) return;
    setStopping(true);
    stoppedRef.current = true; // halt pollSession's next iteration
    try {
      await restCall(app, 'POST', 'ai-messages.cancel', { body: { messageId } });
      if (sessionId) {
        const res = await restCall<{ messages: ServerMessage[] }>(app, 'GET', 'ai-messages.list', {
          query: { sessionId, count: 200 },
        });
        if (Array.isArray(res.messages)) setMessages(mapMessages(res.messages));
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to stop the response.');
    } finally {
      setStopping(false);
    }
  }, [app, stopping]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="container chat-container">
      <h1>AI Chat</h1>

      <AiChatExecutorSelect identity={botIdentity} selected={executor} onChange={setExecutor} disabled={busy} />

      <div className="chat-log" ref={scrollRef}>
        {messages.length === 0 && !busy && (
          <p className="empty-text">Start a conversation — messages are saved to this room's AI Chat session.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`chat-msg chat-${m.role}`}>
            <div className="chat-bubble">{m.role === 'assistant' ? <AssistantBlocks m={m} /> : m.text}</div>
          </div>
        ))}
      </div>

      {error && <div className="error-message">{error}</div>}

      {attachment && (
        <div className="chat-attachment">
          📎 {attachment.name}
          <button type="button" className="chat-attach-remove" onClick={() => setAttachment(null)} aria-label="Remove attachment">
            ✕
          </button>
        </div>
      )}

      <div className="chat-input-row">
        <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={(e) => onPickFile(e.target.files?.[0] || null)} />
        <button
          type="button"
          className="chat-attach-btn"
          onClick={() => fileRef.current?.click()}
          disabled={busy || uploading}
          title="Attach file"
        >
          {uploading ? '…' : '📎'}
        </button>
        <textarea
          className="chat-input"
          rows={4}
          value={input}
          placeholder="Type a message, Enter to send"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={busy}
        />
        {busy ? (
          <button type="button" className="btn-submit chat-stop-btn" onClick={stop} disabled={stopping || !hasInflight}>
            {stopping ? 'Stopping…' : 'Stop'}
          </button>
        ) : (
          <button type="button" className="btn-submit" onClick={send} disabled={!input.trim() && !attachment}>
            Send
          </button>
        )}
      </div>
    </div>
  );
}
