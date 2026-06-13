/**
 * AI chat panel — talk to the PrivOS Sandbox agent from inside the app iframe.
 *
 * The host postMessage bridge times out long requests (~10s) while a sandbox
 * generation can take minutes, so we use the async + poll pair:
 *   1. POST agents.sandbox.generate-async  -> { attemptId }   (returns immediately)
 *   2. GET  agents.sandbox.attempt-status  -> { status, text? } (poll until terminal)
 * Both run as the current user and need the `sandbox:generate` scope. The hub
 * resolves the room's Sandbox config (or the global fallback).
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos/app-react';
import { restCall } from './privos-rest';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_TRIES = 200; // ~10 min ceiling

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function AiChatPanel() {
  const app = usePrivosApp();
  const { roomId } = usePrivosContext();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const send = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt || !roomId || busy) return;
    setInput('');
    setError(null);
    setMessages((m) => [...m, { role: 'user', text: prompt }]);
    setBusy(true);
    try {
      // 1. Enqueue — fast, fits the bridge timeout.
      const started = await restCall<{ attemptId: string }>(
        app, 'POST', 'agents.sandbox.generate-async', { body: { roomId, prompt } },
      );
      const attemptId = started.attemptId;
      if (!attemptId) throw new Error('No attemptId returned.');

      // 2. Poll until the attempt reaches a terminal status.
      let text = '';
      for (let i = 0; i < POLL_MAX_TRIES; i++) {
        await delay(POLL_INTERVAL_MS);
        const res = await restCall<{ status: string; text?: string }>(
          app, 'GET', 'agents.sandbox.attempt-status', { query: { roomId, attemptId } },
        );
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
  }, [app, roomId, input, busy]);

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
          <p className="empty-text">Ask the Sandbox agent anything about this room.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg chat-${m.role}`}>
            <div className="chat-bubble">{m.text}</div>
          </div>
        ))}
        {busy && (
          <div className="chat-msg chat-assistant">
            <div className="chat-bubble chat-thinking">Thinking…</div>
          </div>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="chat-input-row">
        <textarea
          className="chat-input"
          rows={2}
          value={input}
          placeholder="Type a message, Enter to send"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={busy}
        />
        <button type="button" className="btn-submit" onClick={send} disabled={busy || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
