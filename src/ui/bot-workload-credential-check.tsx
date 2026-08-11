/**
 * "Validate credential" control for the Bot workload tab. Proves the agent
 * bot credential a workspace admin issued from Admin > Apps > this app >
 * Settings actually works, by calling the backend tool
 * `hr_agent_bot_credential_check`, which hits the Hub's own `/api/v1/me`
 * with the app's declared env credential. See `agent-bot-credential-check.ts`.
 *
 * This app never sees, requests, or renders the credential value itself —
 * only the Hub's yes/no outcome and, on success, the bot's own identity.
 */
import { useState } from 'react';
import { usePrivosApp, parseToolResult } from '@privos_ai/app-react';

type CredentialCheckResult =
  | { status: 'not-configured' }
  | { status: 'hub-unreachable' }
  | { status: 'invalid'; httpStatus: number }
  | { status: 'valid'; botId: string; username: string };

export default function BotWorkloadCredentialCheck() {
  const app = usePrivosApp();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CredentialCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function validate() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const raw = await app.callServerTool({ name: 'hr_agent_bot_credential_check', arguments: {} });
      setResult(parseToolResult(raw) as unknown as CredentialCheckResult);
    } catch (toolError) {
      setError(toolError instanceof Error ? toolError.message : 'The Hub rejected the validation request.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div className="form-actions">
        <button type="button" onClick={validate} disabled={busy}>
          {busy ? 'Validating…' : 'Validate credential'}
        </button>
      </div>

      {error && <div className="error-message" role="alert">{error}</div>}

      {result?.status === 'not-configured' && (
        <div className="error-message" role="status">
          Not configured: <code>PRIVOS_AGENT_BOT_CREDENTIAL</code> and/or <code>PRIVOS_AGENT_BOT_USER_ID</code> are
          absent from this app's environment.
        </div>
      )}

      {result?.status === 'hub-unreachable' && (
        <div className="error-message" role="status">
          Could not reach the Hub to run this check right now. This does not by itself mean the
          credential is wrong — try again in a moment.
        </div>
      )}

      {result?.status === 'invalid' && (
        <div className="error-message" role="status">
          The Hub rejected these credentials (HTTP {result.httpStatus}). Most likely cause: a
          workspace admin re-issued this credential and this running container still holds the
          previous, now-dead value — the new value only reaches the app after the admin applies
          the configuration, which recreates its containers.
        </div>
      )}

      {result?.status === 'valid' && (
        <ul className="file-list" aria-label="Validated agent bot credential identity">
          <li className="file-row">
            <span className="file-name">Hub accepted these credentials as</span>
            <span className="file-size">@{result.username}</span>
          </li>
          <li className="file-row">
            <span className="file-name">Bot ID</span>
            <span className="file-size">{result.botId}</span>
          </li>
        </ul>
      )}
    </div>
  );
}
