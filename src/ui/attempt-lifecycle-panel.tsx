/**
 * Attempt lifecycle — Step-1 generic platform contract (merged hub
 * `bff01ee8`, live only on tenant.132+): attempt observation (phase /
 * pending-question / bounded output / timestamps), real worker cancel, and
 * caller-stable `operationId` idempotency on `agents.sandbox.generate-async`.
 *
 * All calls run as the current user under the room's already-approved
 * `sandbox:generate` grant — the hub's REST allowlist maps
 * attempt-observation/-cancel/-evidence to that SAME scope
 * (`mcp-rest-allowlist.ts`), so no new manifest permission is requested here.
 *
 * The idempotency demo dispatches the SAME operationId twice with the SAME
 * request and shows the returned attemptId converges to one attempt, then
 * dispatches a THIRD time with the SAME operationId but a changed prompt and
 * expects the Hub to fail closed — an operationId bound to one request can
 * never silently rebind to a different one.
 */
import { useCallback, useState } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import { restCall } from './privos-rest';
import { buildGenerateAsyncPayload } from './bot-workload-helpers';
import AttemptObservationSection from './attempt-observation-section';

interface DispatchResult {
  attemptId: string;
  taskId: string;
}

interface StepLog {
  step: string;
  ok: boolean;
  detail: string;
}

function newOperationId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `op-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function AttemptLifecyclePanel() {
  const app = usePrivosApp();
  const { roomId, effectiveScopes } = usePrivosContext();
  const canGenerate = effectiveScopes?.includes('sandbox:generate') === true;

  const [taskId] = useState(() => `attempt-lifecycle-demo-${Date.now().toString(36)}`);
  const [taskTitle] = useState('Attempt lifecycle demo task');
  const [prompt, setPrompt] = useState('Say hello once and stop.');
  const [operationId, setOperationId] = useState(newOperationId);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [logs, setLogs] = useState<StepLog[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const log = useCallback((step: string, ok: boolean, detail: string) => {
    setLogs((prev) => [...prev, { step, ok, detail }]);
  }, []);

  const dispatch = useCallback(
    async (dispatchPrompt: string): Promise<DispatchResult> => {
      if (!roomId) throw new Error('No roomId in context yet — reopen the app inside a Room.');
      const payload = buildGenerateAsyncPayload({ roomId, prompt: dispatchPrompt, taskId, taskTitle, operationId });
      return restCall<DispatchResult>(app, 'POST', 'agents.sandbox.generate-async', { body: payload });
    },
    [app, roomId, taskId, taskTitle, operationId],
  );

  const runFirst = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await dispatch(prompt);
      setAttemptId(result.attemptId);
      log('1. First dispatch', true, `attemptId ${result.attemptId} (operationId ${operationId}).`);
    } catch (err: any) {
      const message = err?.message || 'Dispatch failed.';
      setError(message);
      log('1. First dispatch', false, message);
    } finally {
      setBusy(false);
    }
  }, [dispatch, prompt, operationId, log]);

  const runSame = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await dispatch(prompt);
      const converged = attemptId !== null && result.attemptId === attemptId;
      log(
        '2. Re-dispatch (same operationId + same request)',
        converged,
        converged
          ? `Converged on the same attempt (${result.attemptId}) — no duplicate attempt was created.`
          : `Did NOT converge: got ${result.attemptId}, expected ${attemptId}.`,
      );
      setAttemptId(result.attemptId);
    } catch (err: any) {
      log('2. Re-dispatch (same operationId + same request)', false, err?.message || 'Dispatch failed.');
    } finally {
      setBusy(false);
    }
  }, [dispatch, prompt, attemptId, log]);

  const runChanged = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await dispatch(`${prompt} — changed for the fail-closed demo`);
      log(
        '3. Re-dispatch (same operationId + CHANGED request)',
        false,
        `Expected this to fail closed, but the Hub returned attemptId ${result.attemptId} instead.`,
      );
    } catch (err: any) {
      log(
        '3. Re-dispatch (same operationId + CHANGED request)',
        true,
        `Failed closed as expected: ${err?.message || 'request rejected'}.`,
      );
    } finally {
      setBusy(false);
    }
  }, [dispatch, prompt, log]);

  const reset = useCallback(() => {
    setAttemptId(null);
    setLogs([]);
    setError(null);
    setOperationId(newOperationId());
  }, []);

  return (
    <section className="container">
      <h1>Attempt lifecycle</h1>
      <p className="empty-text">
        Code-ready against the Step-1 generic platform contract — live only once this room's Hub is
        on tenant.132+. Demonstrates <code>agents.sandbox.attempt-observation</code>,{' '}
        <code>agents.sandbox.attempt-cancel</code>, and caller-stable <code>operationId</code>{' '}
        idempotency on <code>agents.sandbox.generate-async</code>. Uses the already-approved{' '}
        <code>sandbox:generate</code> permission; no new scope is requested.
      </p>

      {!canGenerate && (
        <div className="items-count">
          This tab needs the optional <code>sandbox:generate</code> permission, which is not granted.
        </div>
      )}

      <div className="form-group">
        <label htmlFor="attempt-operation-id">Operation ID (caller-supplied, idempotency key)</label>
        <input
          id="attempt-operation-id"
          value={operationId}
          onChange={(e) => setOperationId(e.target.value)}
          disabled={busy || attemptId !== null}
        />
      </div>
      <div className="form-group">
        <label htmlFor="attempt-prompt">Prompt</label>
        <textarea id="attempt-prompt" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={busy} />
      </div>
      <p className="loading-text" style={{ margin: '4px 0' }}>
        Task ID: <code>{taskId}</code>
      </p>

      {error && <div className="error-message" role="alert">{error}</div>}

      <div className="form-actions">
        <button
          type="button"
          className="btn-submit"
          onClick={runFirst}
          disabled={!canGenerate || busy || attemptId !== null || !prompt.trim()}
        >
          {busy ? 'Working…' : '1. Dispatch'}
        </button>
        <button type="button" onClick={runSame} disabled={!canGenerate || busy || attemptId === null}>
          2. Re-dispatch (same operationId + same request)
        </button>
        <button type="button" onClick={runChanged} disabled={!canGenerate || busy || attemptId === null}>
          3. Re-dispatch (same operationId + changed request)
        </button>
        <button type="button" onClick={reset} disabled={busy}>
          Reset (new operationId)
        </button>
      </div>

      {logs.length > 0 && (
        <ul className="file-list" aria-label="Idempotency demo steps" style={{ marginTop: 16 }}>
          {logs.map((entry, i) => (
            <li key={i} className="file-row">
              <span className="file-name">
                {entry.ok ? '✓' : '✗'} {entry.step}
              </span>
              <span className="file-size">{entry.detail}</span>
            </li>
          ))}
        </ul>
      )}

      <AttemptObservationSection app={app} roomId={roomId} attemptId={attemptId} />
    </section>
  );
}
