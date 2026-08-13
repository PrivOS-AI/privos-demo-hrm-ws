/**
 * Sandbox connect panel — provision the room's PrivOS Sandbox project and push
 * (or refresh) its bot key, so the room can run agents.
 *
 * Both calls go through the SDK REST passthrough (`app.rest()`), gated by the
 * `sandbox:botkey:push` scope (declare it in package.json `scopes`):
 *   - status: GET  agents.sandbox.botKeyStatus?roomId=...
 *   - push:   POST agents.sandbox.pushBotKey { roomId }
 *
 * It also demos waking an idle VM WITHOUT re-pushing the key, gated by the
 * `sandbox:wake` scope:
 *   - wake:    POST agents.sandbox.wake { roomId }   -> { accepted: true }
 *   - vmState: GET  agents.sandbox.vmState?roomId=... -> { vmState, errorMessage? }
 *
 * Note: both push and wake additionally require the logged-in user to be a room admin
 * (`edit-room`) and the bot's owner (or hold `edit-bot`). The hub enforces that
 * server-side — `status.canPush` reflects it, so a non-admin sees a disabled button.
 * `vmState` is a pure read — it never wakes the VM.
 */
import { useState, useEffect, useCallback } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import { restCall } from './privos-rest';
import { useBotKeyAutoPush } from './botkey-autopush-controller';

interface BotKeyStatus {
  pushed: boolean;
  hasBot: boolean;
  hasSandbox: boolean;
  canPush: boolean;
  /** Why the key is not usable. `sandbox-key-stale` = the sandbox holds a different one. */
  reason?: 'no-record' | 'last-push-failed' | 'hash-mismatch' | 'config-missing' | 'sandbox-state-lost' | 'sandbox-key-stale';
  /** The hub still has an automatic repair available for this key and divergence. */
  autoPushEligible?: boolean;
  status?: 'success' | 'failed' | 'drift';
  pushedAt?: string;
  privosSandboxId?: string;
  errorMessage?: string;
}

export default function SandboxConnectPanel() {
  const app = usePrivosApp();
  const { roomId, effectiveScopes } = usePrivosContext();
  const canWake = effectiveScopes?.includes('sandbox:wake') === true;

  const [status, setStatus] = useState<BotKeyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushedMsg, setPushedMsg] = useState<string | null>(null);
  const [waking, setWaking] = useState(false);
  const [vmState, setVmState] = useState<string | null>(null);
  const { phase: autoPushPhase, message: autoPushMessage, autoPush, reset: resetAutoPush } = useBotKeyAutoPush();

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

  // Trigger B: the status read this panel already performs says the sandbox
  // holds a different key and the hub still has its one automatic repair. Take
  // it — this is the same reflex a chat turn has, minus the click. No polling
  // of our own: this only ever runs off a status the panel loaded anyway.
  useEffect(() => {
    if (status?.reason !== 'sandbox-key-stale' || status?.autoPushEligible !== true) return;
    let cancelled = false;
    (async () => {
      if (await autoPush()) {
        if (!cancelled) await loadStatus();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status?.reason, status?.autoPushEligible, autoPush, loadStatus]);

  // Provision the project + push/refresh the bot key (room admin only).
  async function handlePush() {
    if (!roomId) return;
    setPushing(true);
    setError(null);
    setPushedMsg(null);
    try {
      await restCall<{ privosSandboxId?: string; pushedAt?: string }>(
        app, 'POST', 'agents.sandbox.pushBotKey', { body: { roomId } },
      );
      // Don't surface privosSandboxId — it's the internal board host, not user-facing.
      setPushedMsg('Connected — sandbox provisioned.');
      // A person fixed it, so automation is allowed to help again.
      resetAutoPush();
      await loadStatus();
    } catch (err: any) {
      // A non-admin / non-owner hits the server-side authorizePushBotKey check here.
      setError(err?.message || 'Failed to push bot key (room admin required).');
    } finally {
      setPushing(false);
    }
  }

  // Wake/establish the room's VM without re-pushing the key, then poll vmState
  // until it settles (running / error / not_found). Coalesces with any in-flight
  // establishment server-side, so calling it repeatedly is safe.
  async function handleWake() {
    if (!roomId) return;
    setWaking(true);
    setError(null);
    setVmState('starting');
    try {
      await restCall<{ accepted: boolean }>(app, 'POST', 'agents.sandbox.wake', { body: { roomId } });
      // Poll vmState (pure read — does not wake) up to ~60s for it to settle.
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const { vmState: s, errorMessage } = await restCall<{ vmState: string; errorMessage?: string }>(
          app, 'GET', 'agents.sandbox.vmState', { query: { roomId } },
        );
        setVmState(s);
        if (s === 'running' || s === 'not_found') break;
        if (s === 'error') { setError(errorMessage || 'VM failed to start.'); break; }
      }
    } catch (err: any) {
      // A non-admin / non-owner hits the server-side authorizePushBotKey check here.
      setError(err?.message || 'Failed to wake VM (room admin required).');
      setVmState(null);
    } finally {
      setWaking(false);
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
      {autoPushMessage && autoPushPhase !== 'idle' && (
        <div className={autoPushPhase === 'manual-required' ? 'error-message' : 'items-count'} role="status">
          {autoPushMessage}
        </div>
      )}

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

      {/* Wake an idle VM without re-pushing the bot key (sandbox:wake scope). */}
      {connected && (
        <div className="form-actions" style={{ marginBlockStart: 8 }}>
          <button
            type="button"
            className="btn-submit"
            onClick={handleWake}
            disabled={waking || loading || !canPush || !canWake}
            title={!canWake ? 'Optional sandbox:wake permission not granted' : undefined}
          >
            {waking ? 'Waking…' : 'Wake VM'}
          </button>
          {vmState && (
            <span className="file-size" style={{ marginInlineStart: 8 }}>
              VM: {vmState}{vmState === 'running' ? ' ✓' : ''}
            </span>
          )}
          {!canWake && (
            <span className="file-size" style={{ marginInlineStart: 8 }}>Wake is disabled by installation permissions.</span>
          )}
        </div>
      )}
    </div>
  );
}
