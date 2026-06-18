/**
 * AI chat panel — talk to the PrivOS Sandbox agent from inside the app iframe,
 * optionally grounding the answer on an attached document.
 *
 * Flow (all as the current user, scope `sandbox:generate`):
 *   - attach: POST agents.sandbox.upload  -> { tempId }      (file → sandbox temp store)
 *   - send:   POST agents.sandbox.generate-async { fileIds } -> { attemptId }
 *   - poll:   GET  agents.sandbox.attempt-status?partial=1   -> { status, text?, json? }
 * The bridge times out long requests (~10s) so we enqueue + poll. We poll with
 * `partial=1` so each tick returns the blocks emitted so far, and render them
 * block-by-block (typed out) as the agent generates — see agent-blocks.tsx.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos/app-react';
import { restCall } from './privos-rest';
import MarkdownBlocks from './markdown-blocks';
import AgentBlocks, { flattenAgentBlocks } from './agent-blocks';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  fileName?: string;
  // Structured response blocks from the attempt logs (assistant turns only).
  json?: any[];
  // True while the attempt is still running and blocks are streaming in.
  streaming?: boolean;
}

/** Replace the trailing assistant message (the streaming one) with updated fields. */
function patchStreamingMessage(messages: ChatMessage[], patch: Partial<ChatMessage>): ChatMessage[] {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return messages;
  return [...messages.slice(0, -1), { ...last, ...patch }];
}

interface Attachment {
  tempId: string;
  name: string;
}

const POLL_INTERVAL_MS = 1200; // poll faster so streamed blocks appear promptly
const POLL_MAX_TRIES = 500; // ~10 min ceiling at 1.2s/poll
// A cold Sandbox VM (just spawned/reset) can take far longer than the bridge's
// default 10s to ack an upload or enqueue, so give these calls a generous window.
const SANDBOX_TIMEOUT_MS = 240000;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const readAsDataUri = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

export default function AiChatPanel() {
  const app = usePrivosApp();
  const { roomId } = usePrivosContext();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

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
        const base64 = dataUri.includes(',') ? dataUri.slice(dataUri.indexOf(',') + 1) : dataUri;
        const res = await restCall<{ tempId: string }>(app, 'POST', 'agents.sandbox.upload', {
          body: { roomId, fileName: file.name, mimeType: file.type || 'application/octet-stream', base64 },
          timeoutMs: SANDBOX_TIMEOUT_MS,
        });
        if (!res.tempId) throw new Error('No tempId returned.');
        setAttachment({ tempId: res.tempId, name: file.name });
      } catch (err: any) {
        setError(err?.message || 'Attach failed.');
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = '';
      }
    },
    [app, roomId],
  );

  const send = useCallback(async () => {
    const prompt = input.trim();
    if ((!prompt && !attachment) || !roomId || busy) return;
    setInput('');
    setError(null);
    const sentAttachment = attachment;
    setAttachment(null);
    // Add the user message + an empty streaming assistant placeholder to fill in live.
    setMessages((m) => [
      ...m,
      { role: 'user', text: prompt || '(document)', fileName: sentAttachment?.name },
      { role: 'assistant', text: '', json: [], streaming: true },
    ]);
    setBusy(true);
    try {
      // 1. Enqueue — attach the uploaded document via fileIds when present.
      const started = await restCall<{ attemptId: string }>(app, 'POST', 'agents.sandbox.generate-async', {
        body: {
          roomId,
          prompt: prompt || 'Summarise the attached document.',
          ...(sentAttachment && { fileIds: [sentAttachment.tempId] }),
        },
        timeoutMs: SANDBOX_TIMEOUT_MS,
      });
      const attemptId = started.attemptId;
      if (!attemptId) throw new Error('No attemptId returned.');

      // 2. Poll with partial=1 until terminal, streaming blocks into the placeholder.
      let terminal = false;
      for (let i = 0; i < POLL_MAX_TRIES; i++) {
        await delay(POLL_INTERVAL_MS);
        const res = await restCall<{ status: string; text?: string; json?: any[] }>(app, 'GET', 'agents.sandbox.attempt-status', {
          query: { roomId, attemptId, partial: '1' },
        });
        const json = Array.isArray(res.json) ? res.json : undefined;
        const running = res.status === 'running';
        setMessages((m) => patchStreamingMessage(m, { text: res.text || '', json, streaming: running }));
        if (!running) {
          terminal = true;
          // On a terminal status with no blocks/text, surface the status.
          if (!res.text && !(json && flattenAgentBlocks(json).length)) {
            setMessages((m) => patchStreamingMessage(m, { text: `(no response — status: ${res.status})` }));
          }
          break;
        }
      }
      if (!terminal) setMessages((m) => patchStreamingMessage(m, { text: '(timed out waiting for the agent)', streaming: false }));
    } catch (err: any) {
      setError(err?.message || 'Generation failed.');
      setMessages((m) => patchStreamingMessage(m, { streaming: false }));
    } finally {
      setBusy(false);
    }
  }, [app, roomId, input, attachment, busy]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="container chat-container">
      <h1>AI Chat</h1>

      <div className="chat-log" ref={scrollRef}>
        {messages.length === 0 && !busy && (
          <p className="empty-text">Ask the Sandbox agent anything, or attach a document to ground the answer.</p>
        )}
        {messages.map((m, i) => {
          const hasBlocks = m.role === 'assistant' && m.json && flattenAgentBlocks(m.json).length > 0;
          return (
            <div key={i} className={`chat-msg chat-${m.role}`}>
              <div className="chat-bubble">
                {m.fileName && <div className="chat-file-tag">📎 {m.fileName}</div>}
                {m.role !== 'assistant' && m.text}
                {m.role === 'assistant' && hasBlocks && <AgentBlocks json={m.json} streaming={m.streaming} />}
                {m.role === 'assistant' && !hasBlocks && m.text && <MarkdownBlocks text={m.text} />}
                {m.role === 'assistant' && !hasBlocks && !m.text && m.streaming && <span className="chat-thinking">Thinking…</span>}
              </div>
            </div>
          );
        })}
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
        <input
          ref={fileRef}
          type="file"
          style={{ display: 'none' }}
          onChange={(e) => onPickFile(e.target.files?.[0] || null)}
        />
        <button
          type="button"
          className="chat-attach-btn"
          onClick={() => fileRef.current?.click()}
          disabled={busy || uploading}
          title="Attach document"
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
        <button type="button" className="btn-submit" onClick={send} disabled={busy || (!input.trim() && !attachment)}>
          Send
        </button>
      </div>
    </div>
  );
}
