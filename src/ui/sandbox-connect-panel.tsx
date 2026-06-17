/**
 * Sandbox connect panel — provision the room's PrivOS Sandbox project and push
 * (or refresh) its bot key, so the room can run agents.
 *
 * Both calls go through the SDK REST passthrough (`app.rest()`), gated by the
 * `sandbox:botkey:push` scope (declare it in package.json `scopes`):
 *   - status: GET  agents.sandbox.botKeyStatus?roomId=...
 *   - push:   POST agents.sandbox.pushBotKey { roomId }
 *
 * Note: the push call additionally requires the logged-in user to be a room admin
 * (`edit-room`) and the bot's owner (or hold `edit-bot`). The hub enforces that
 * server-side — `status.canPush` reflects it, so a non-admin sees a disabled button.
 */
import { useState, useEffect, useCallback } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos/app-react';
import { restCall } from './privos-rest';

interface BotKeyStatus {
  pushed: boolean;
  hasBot: boolean;
  hasSandbox: boolean;
  canPush: boolean;
  status?: 'success' | 'failed' | 'drift';
  pushedAt?: string;
  privosSandboxId?: string;
  errorMessage?: string;
}

export default function SandboxConnectPanel() {
  const app = usePrivosApp();
  const { roomId } = usePrivosContext();

  const [status, setStatus] = useState<BotKeyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushedMsg, setPushedMsg] = useState<string | null>(null);

  // Read the current provisioning / push status for this room.
  const loadStatus = useCallback(async () => {
    if (!roomId) return;
    setLoading(true);
    setError(null);
    try {
      const body = await restCall<BotKeyStatus>(app, 'GET', 'agents.sandbox.botKeyStatus', {
        query: { roomId },
      });
      setStatus(body);
    } catch (err: any) {
      setError(err?.message || 'Failed to load sandbox status.');
    } finally {
      setLoading(false);
    }
  }, [app, roomId]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // Provision the project + push/refresh the bot key (room admin only).
  async function handlePush() {
    if (!roomId) return;
    setPushing(true);
    setError(null);
    setPushedMsg(null);
    try {
      const res = await restCall<{ privosSandboxId?: string; pushedAt?: string }>(
        app, 'POST', 'agents.sandbox.pushBotKey', { body: { roomId } },
      );
      setPushedMsg(`Connected — sandbox ${res?.privosSandboxId ?? 'project'} provisioned.`);
      await loadStatus();
    } catch (err: any) {
      // A non-admin / non-owner hits the server-side authorizePushBotKey check here.
      setError(err?.message || 'Failed to push bot key (room admin required).');
    } finally {
      setPushing(false);
    }
  }

  const connected = status?.pushed === true;
  const canPush = status?.canPush === true;

  return (
    <div className="container">
      <h1>Sandbox</h1>
      <p className="empty-text">Provision this room's PrivOS Sandbox and push its bot key so it can run agents.</p>

      {error && <div className="error-message">{error}</div>}
      {pushedMsg && <div className="items-count">{pushedMsg}</div>}

      {loading ? (
        <p className="loading-text">Loading sandbox status...</p>
      ) : (
        <ul className="file-list">
          <li className="file-row">
            <span className="file-name">
              Status
              <span className="file-size" style={{ display: 'block' }}>
                {connected ? `Connected${status?.pushedAt ? ` (pushed ${new Date(status.pushedAt).toLocaleString()})` : ''}` : 'Not connected'}
                {status?.status === 'drift' ? ' — config drift, re-push to refresh' : ''}
                {status?.errorMessage ? ` — ${status.errorMessage}` : ''}
              </span>
            </span>
          </li>
          {!status?.hasSandbox && (
            <li className="file-row">
              <span className="file-name">
                No sandbox configured
                <span className="file-size" style={{ display: 'block' }}>Set the room's PrivOS Sandbox URL/key first.</span>
              </span>
            </li>
          )}
        </ul>
      )}

      <div className="form-actions">
        <button
          type="button"
          className="btn-submit"
          onClick={handlePush}
          disabled={pushing || loading || !canPush}
        >
          {pushing ? 'Connecting...' : connected ? 'Re-push bot key' : 'Connect sandbox'}
        </button>
        {!loading && !canPush && (
          <span className="file-size" style={{ marginInlineStart: 8 }}>Room admin required.</span>
        )}
      </div>
    </div>
  );
}
