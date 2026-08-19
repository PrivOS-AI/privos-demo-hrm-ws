/**
 * Attempt evidence — Step-1 generic platform contract (merged hub
 * `bff01ee8`, live only on tenant.132+): `agents.sandbox.attempt-evidence`
 * reads the per-attempt LLM/gateway call log (model / provider / effort /
 * turn / correlation) for one attempt this room owns. Runs as the current
 * user under the already-approved `sandbox:generate` permission (same REST
 * allowlist group as the rest of the Sandbox attempt lifecycle,
 * `mcp-rest-allowlist.ts`) — no new scope.
 *
 * Paste an attemptId from the Attempt lifecycle tab (or any attempt this
 * room started) to inspect it.
 */
import { useState } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import { restCall } from './privos-rest';

interface EvidenceCall {
  callId: string;
  model?: string;
  provider?: string;
  effort?: string;
  turn?: number;
  correlation?: string;
}

interface EvidenceResult {
  attemptId: string;
  calls: EvidenceCall[];
  source?: string;
}

export default function AttemptEvidencePanel() {
  const app = usePrivosApp();
  const { roomId, effectiveScopes } = usePrivosContext();
  const canGenerate = effectiveScopes?.includes('sandbox:generate') === true;

  const [attemptId, setAttemptId] = useState('');
  const [result, setResult] = useState<EvidenceResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!roomId || !attemptId.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const evidence = await restCall<EvidenceResult>(app, 'GET', 'agents.sandbox.attempt-evidence', {
        query: { roomId, attemptId: attemptId.trim() },
      });
      setResult(evidence);
    } catch (err: any) {
      setError(err?.message || 'Failed to read attempt evidence.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="container">
      <h1>Attempt evidence</h1>
      <p className="empty-text">
        Code-ready against the Step-1 generic platform contract — live only once this room's Hub is
        on tenant.132+. Reads the LLM/gateway evidence recorded for one Sandbox attempt via{' '}
        <code>agents.sandbox.attempt-evidence</code>. Uses the already-approved{' '}
        <code>sandbox:generate</code> permission; no new scope is requested.
      </p>

      {!canGenerate && (
        <div className="items-count">
          This tab needs the optional <code>sandbox:generate</code> permission, which is not granted.
        </div>
      )}

      <div className="form-group">
        <label htmlFor="evidence-attempt-id">Attempt ID</label>
        <input
          id="evidence-attempt-id"
          value={attemptId}
          onChange={(e) => setAttemptId(e.target.value)}
          placeholder="Paste an attemptId from the Attempt lifecycle tab"
          disabled={busy}
        />
      </div>

      {error && <div className="error-message" role="alert">{error}</div>}

      <div className="form-actions">
        <button type="button" className="btn-submit" onClick={load} disabled={!canGenerate || busy || !attemptId.trim() || !roomId}>
          {busy ? 'Loading…' : 'Read evidence'}
        </button>
      </div>

      {result && result.calls.length === 0 && (
        <div className="items-count">No LLM/gateway calls recorded yet for this attempt.</div>
      )}

      {result && result.calls.length > 0 && (
        <ul className="file-list" aria-label="Attempt evidence calls">
          {result.calls.map((call) => (
            <li key={call.callId} className="file-row">
              <span className="file-name">
                Turn {call.turn ?? '—'} · {call.provider ?? 'unknown provider'} / {call.model ?? 'unknown model'}
                {call.effort ? ` (${call.effort})` : ''}
              </span>
              <span className="file-size">{call.correlation ?? call.callId}</span>
            </li>
          ))}
        </ul>
      )}

      {result && (
        <details className="chat-json-block" style={{ marginTop: 12 }}>
          <summary>Raw evidence response</summary>
          <pre className="chat-json-pre"><code>{JSON.stringify(result, null, 2)}</code></pre>
        </details>
      )}
    </section>
  );
}
