/**
 * AI chat panel — talk to the PrivOS Sandbox agent from inside the app iframe,
 * optionally grounding the answer on an attached document.
 *
 * Flow (all as the current user, scope `sandbox:generate`):
 *   - attach: POST agents.sandbox.upload  -> { tempId }      (file → sandbox temp store)
 *   - send:   POST agents.sandbox.generate-async { fileIds } -> { attemptId }
 *   - poll:   GET  agents.sandbox.attempt-status            -> { status, text? }
 * The bridge times out long requests (~10s) so we enqueue + poll. The assistant
 * reply is rendered in full, segmented into markdown blocks.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos/app-react';
import { restCall } from './privos-rest';
import MarkdownBlocks from './markdown-blocks';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  fileName?: string;
}

interface Attachment {
  tempId: string;
  name: string;
}

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_TRIES = 200; // ~10 min ceiling
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
    setMessages((m) => [...m, { role: 'user', text: prompt || '(document)', fileName: sentAttachment?.name }]);
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

      // 2. Poll until the attempt reaches a terminal status.
      let text = '';
      for (let i = 0; i < POLL_MAX_TRIES; i++) {
        await delay(POLL_INTERVAL_MS);
        const res = await restCall<{ status: string; text?: string }>(app, 'GET', 'agents.sandbox.attempt-status', {
          query: { roomId, attemptId },
        });
        if (res.status !== 'running') {
          text = res.text || `(no text — status: ${res.status})`;
          break;
        }
      }
      if (!text) text = '(timed out waiting for the agent)';
      setMessages((m) => [...m, { role: 'assistant', text }]);
    } catch (err: any) {
      setError(err?.message || 'Generation failed.');
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
    <div className="container">
      <h1>AI Chat</h1>

      <div className="chat-log" ref={scrollRef}>
        {messages.length === 0 && !busy && (
          <p className="empty-text">Ask the Sandbox agent anything, or attach a document to ground the answer.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg chat-${m.role}`}>
            <div className="chat-bubble">
              {m.fileName && <div className="chat-file-tag">📎 {m.fileName}</div>}
              {m.role === 'assistant' ? <MarkdownBlocks text={m.text} /> : m.text}
            </div>
          </div>
        ))}
        {busy && (
          <div className="chat-msg chat-assistant">
            <div className="chat-bubble chat-thinking">Thinking…</div>
          </div>
        )}
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
          rows={2}
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
