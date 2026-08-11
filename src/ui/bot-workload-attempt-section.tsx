/**
 * Executor pick + generate-async + poll + question surfacing — the second
 * half of the Bot workload lifecycle (see `bot-workload-panel.tsx`).
 *
 * Flow (all as the current user, [sandbox:generate]):
 *   1. POST agents.sandbox.generate-async { roomId, prompt, taskId, taskTitle, botId? }
 *      -> { attemptId, taskId, source }
 *   2. GET  agents.sandbox.attempt-status?roomId&attemptId&botId? (poll)
 *      -> { status: 'running' | 'completed' | 'failed' | 'cancelled', text? }
 *
 * `botId` is the ONE legitimate caller-supplied selector here (see
 * bot-workload-helpers.ts) — never a `projectId`, which the Hub always
 * derives itself from the resolved executor. A task stays bound to whichever
 * bot ran its FIRST attempt: re-running the SAME Task ID with a DIFFERENT
 * executor bot is rejected by the Hub. This app only ever owns one
 * installation bot, so demonstrating that rejection needs a second, real bot
 * from this workspace — the "Custom bot ID" option below exists for that.
 *
 * If an attempt raises a question, the Hub posts it as a thread message from
 * the executing bot; only a room OWNER can answer it there.
 * `agents.sandbox.answer` is deliberately not exposed to apps, so this panel
 * never attempts to answer — it can only tell you to go look.
 */
import { useState, useCallback, useRef } from 'react';
import type { McpApp } from '@privos_ai/app-react';
import { restCall } from './privos-rest';
import { buildGenerateAsyncPayload, ATTEMPT_TERMINAL } from './bot-workload-helpers';

interface Identity {
  botId: string;
  username: string;
}

interface Props {
  app: McpApp;
  roomId?: string;
  identity: Identity | null;
  canGenerate: boolean;
}

type Executor = 'default' | 'installation' | 'custom';

const POLL_INTERVAL_MS = 1500;
const POLL_MAX_TRIES = 200; // ~5 min ceiling at 1.5s/poll

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function BotWorkloadAttemptSection({ app, roomId, identity, canGenerate }: Props) {
  const [executor, setExecutor] = useState<Executor>('default');
  const [customBotId, setCustomBotId] = useState('');
  const [taskId, setTaskId] = useState('workload-demo-task');
  const [taskTitle, setTaskTitle] = useState('Bot workload demo task');
  const [prompt, setPrompt] = useState('Say hello and name which bot executed this attempt.');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [resultText, setResultText] = useState<string | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stoppedRef = useRef(false);

  const botId =
    executor === 'installation' ? identity?.botId : executor === 'custom' ? customBotId.trim() || undefined : undefined;

  const run = useCallback(async () => {
    if (!roomId || busy) return;
    setBusy(true);
    setError(null);
    setResultText(null);
    setAttemptId(null);
    setStatus('starting');
    stoppedRef.current = false;
    try {
      const payload = buildGenerateAsyncPayload({
        roomId,
        prompt: prompt.trim(),
        taskId: taskId.trim(),
        taskTitle: taskTitle.trim(),
        botId,
      });
      const started = await restCall<{ attemptId: string; taskId: string }>(app, 'POST', 'agents.sandbox.generate-async', {
        body: payload,
      });
      setAttemptId(started.attemptId);
      setStatus('running');

      for (let i = 0; i < POLL_MAX_TRIES; i++) {
        await delay(POLL_INTERVAL_MS);
        if (stoppedRef.current) return;
        // No projectId is ever sent — the Hub derives it from the SAME
        // executor (botId or room default) that started the attempt.
        const polled = await restCall<{ status: string; text?: string }>(app, 'GET', 'agents.sandbox.attempt-status', {
          query: { roomId, attemptId: started.attemptId, ...(botId ? { botId } : {}) },
        });
        setStatus(polled.status);
        if (ATTEMPT_TERMINAL.has(polled.status)) {
          if (polled.status === 'failed') throw new Error('The attempt failed. Check the Room thread for details.');
          setResultText(polled.text || null);
          return;
        }
      }
      setError('Timed out waiting for the attempt. It may still be waiting on a question in the Room thread.');
    } catch (err: any) {
      setError(err?.message || 'Failed to run the attempt.');
    } finally {
      setBusy(false);
    }
  }, [app, roomId, prompt, taskId, taskTitle, botId, busy]);

  return (
    <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
      <h2>Run a Sandbox attempt</h2>

      <div className="form-group">
        <label htmlFor="workload-executor">Executor</label>
        <select
          id="workload-executor"
          value={executor}
          onChange={(event) => setExecutor(event.target.value as Executor)}
          disabled={busy}
        >
          <option value="default">Room default bot (no selector sent)</option>
          <option value="installation" disabled={!identity}>
            {identity ? `Installation bot — @${identity.username}` : 'Installation bot (create and join it above first)'}
          </option>
          <option value="custom">Custom bot ID (demonstrate the executor-binding rule)</option>
        </select>
      </div>

      {executor === 'custom' && (
        <div className="form-group">
          <label htmlFor="workload-custom-bot">Bot ID</label>
          <input
            id="workload-custom-bot"
            value={customBotId}
            onChange={(event) => setCustomBotId(event.target.value)}
            placeholder="Another active bot's user ID in this Room"
            disabled={busy}
          />
          <p className="empty-text" style={{ textAlign: 'left', padding: '4px 0 0' }}>
            Run once with the installation bot on a Task ID, then run again on the SAME Task ID
            with a different bot's ID here — the Hub rejects the second attempt because a task
            stays bound to whichever bot ran its first attempt.
          </p>
        </div>
      )}

      <div className="form-group">
        <label htmlFor="workload-task-id">Task ID</label>
        <input id="workload-task-id" value={taskId} onChange={(event) => setTaskId(event.target.value)} maxLength={200} disabled={busy} />
      </div>
      <div className="form-group">
        <label htmlFor="workload-task-title">Task title</label>
        <input
          id="workload-task-title"
          value={taskTitle}
          onChange={(event) => setTaskTitle(event.target.value)}
          maxLength={200}
          disabled={busy}
        />
      </div>
      <div className="form-group">
        <label htmlFor="workload-prompt">Prompt</label>
        <textarea id="workload-prompt" rows={3} value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={busy} />
      </div>

      <div className="form-actions">
        <button
          type="button"
          className="btn-submit"
          onClick={run}
          disabled={!canGenerate || busy || !prompt.trim() || !taskId.trim() || (executor === 'custom' && !customBotId.trim())}
        >
          {busy ? 'Running…' : 'Run generate-async'}
        </button>
      </div>

      {error && <div className="error-message" role="alert">{error}</div>}

      {attemptId && (
        <ul className="file-list" aria-label="Sandbox attempt status">
          <li className="file-row">
            <span className="file-name">Attempt</span>
            <span className="file-size">{attemptId}</span>
          </li>
          <li className="file-row">
            <span className="file-name">Status</span>
            <span className="file-size">{status}</span>
          </li>
        </ul>
      )}

      {status === 'running' && (
        <p className="empty-text" style={{ textAlign: 'left' }}>
          Still running. If this stays "running" for a while, the attempt may have raised a
          question — check this Room for a new thread message from the executor bot. Only a
          Room OWNER can reply there; this app cannot answer on your behalf
          (agents.sandbox.answer is deliberately not exposed to apps).
        </p>
      )}

      {resultText && <div className="items-count">{resultText}</div>}
    </div>
  );
}
