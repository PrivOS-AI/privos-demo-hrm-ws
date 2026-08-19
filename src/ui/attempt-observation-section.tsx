/**
 * Attempt observation + real cancel — Step-1 `agents.sandbox.attempt-observation`
 * / `agents.sandbox.attempt-cancel` REST endpoints (merged hub `bff01ee8`,
 * live only on tenant.132+). Both run as the current user, gated by the same
 * already-approved `sandbox:generate` scope the rest of the Sandbox attempt
 * lifecycle uses (`mcp-rest-allowlist.ts` in the hub maps all of
 * generate-async/attempt-status/attempt-observation/attempt-cancel/attempt-evidence
 * to that one scope) — no new permission. Split out of
 * `attempt-lifecycle-panel.tsx` to keep both files under this repo's
 * modularization guideline.
 */
import { useCallback, useState } from 'react';
import type { McpApp } from '@privos_ai/app-react';
import { restCall } from './privos-rest';

interface Props {
  app: McpApp;
  roomId?: string;
  attemptId: string | null;
}

interface QuestionBridge {
  toolUseId: string;
  status: string;
}

interface TerminalCause {
  code: string;
  message?: string | null;
}

/**
 * Field names match the Hub's own `IAttemptObservation`
 * (`privos-sandbox-agent-service.ts` in privos-hub) exactly — there is no
 * `logs` field. The bounded output is `output` (an array, item shape
 * unspecified by the worker) plus `outputTruncated`; timestamps are epoch
 * milliseconds, not ISO strings.
 */
interface AttemptObservation {
  attemptId: string;
  status: string;
  phase?: string;
  createdAt?: number;
  startedAt?: number | null;
  updatedAt?: number | null;
  completedAt?: number | null;
  terminalCause?: TerminalCause | null;
  pendingQuestion?: { toolUseId: string; questions: unknown[]; timestamp: number } | null;
  output?: unknown[];
  outputTruncated?: boolean;
  questionBridge?: QuestionBridge | null;
  source?: string;
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

function formatTimestamp(ms: number | null | undefined): string {
  return typeof ms === 'number' ? new Date(ms).toISOString() : '—';
}

export default function AttemptObservationSection({ app, roomId, attemptId }: Props) {
  const [observation, setObservation] = useState<AttemptObservation | null>(null);
  const [busy, setBusy] = useState<'refresh' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!roomId || !attemptId) return;
    setBusy('refresh');
    setError(null);
    try {
      const result = await restCall<AttemptObservation>(app, 'GET', 'agents.sandbox.attempt-observation', {
        query: { roomId, attemptId },
      });
      setObservation(result);
    } catch (err: any) {
      setError(err?.message || 'Failed to read the attempt observation.');
    } finally {
      setBusy(null);
    }
  }, [app, roomId, attemptId]);

  const cancel = useCallback(async () => {
    if (!roomId || !attemptId) return;
    setBusy('cancel');
    setError(null);
    try {
      await restCall(app, 'POST', 'agents.sandbox.attempt-cancel', { body: { roomId, attemptId } });
      await refresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to cancel the attempt.');
    } finally {
      setBusy(null);
    }
  }, [app, roomId, attemptId, refresh]);

  if (!attemptId) return null;

  const terminal = observation ? TERMINAL_STATUSES.has(observation.status) : false;

  return (
    <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
      <h3>Observation — {attemptId}</h3>

      <div className="form-actions">
        <button type="button" onClick={refresh} disabled={busy !== null}>
          {busy === 'refresh' ? 'Refreshing…' : 'Refresh observation'}
        </button>
        <button type="button" onClick={cancel} disabled={busy !== null || terminal}>
          {busy === 'cancel' ? 'Cancelling…' : 'Cancel attempt'}
        </button>
      </div>

      {error && <div className="error-message" role="alert">{error}</div>}

      {observation && (
        <ul className="file-list" aria-label="Attempt observation">
          <li className="file-row">
            <span className="file-name">Status</span>
            <span className="file-size">{observation.status}</span>
          </li>
          {observation.phase && (
            <li className="file-row">
              <span className="file-name">Phase</span>
              <span className="file-size">{observation.phase}</span>
            </li>
          )}
          <li className="file-row">
            <span className="file-name">Created</span>
            <span className="file-size">{formatTimestamp(observation.createdAt)}</span>
          </li>
          <li className="file-row">
            <span className="file-name">Started</span>
            <span className="file-size">{formatTimestamp(observation.startedAt)}</span>
          </li>
          <li className="file-row">
            <span className="file-name">Updated</span>
            <span className="file-size">{formatTimestamp(observation.updatedAt)}</span>
          </li>
          <li className="file-row">
            <span className="file-name">Completed</span>
            <span className="file-size">{formatTimestamp(observation.completedAt)}</span>
          </li>
          {observation.terminalCause && (
            <li className="file-row">
              <span className="file-name">Terminal cause</span>
              <span className="file-size">
                {observation.terminalCause.code}
                {observation.terminalCause.message ? `: ${observation.terminalCause.message}` : ''}
              </span>
            </li>
          )}
        </ul>
      )}

      {observation?.pendingQuestion != null && (
        <div className="items-count" role="status">
          Waiting on a question — phase "waiting-for-user". Only a Room OWNER can answer it, in the
          Room thread (this app never exposes agents.sandbox.answer).
        </div>
      )}

      {observation?.questionBridge && (
        <p className="empty-text" style={{ textAlign: 'left' }}>
          Question bridge status: {observation.questionBridge.status}
        </p>
      )}

      {Array.isArray(observation?.output) && observation.output.length > 0 && (
        <details className="chat-json-block" style={{ marginTop: 12 }}>
          <summary>
            Bounded output ({observation.output.length}
            {observation.outputTruncated ? ', truncated' : ''})
          </summary>
          <pre className="chat-json-pre"><code>{JSON.stringify(observation.output, null, 2)}</code></pre>
        </details>
      )}
    </div>
  );
}
