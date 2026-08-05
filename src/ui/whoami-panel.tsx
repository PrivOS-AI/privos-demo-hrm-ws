/**
 * "Who am I" panel — demonstrates hub-signed user identity end-to-end.
 *
 * Flow:
 *   1. The iframe calls our backend tool through the mediated host bridge.
 *   2. Hub privately dispatches the exact JSON-RPC body with a short-lived signed
 *      assertion containing the verified actor.
 *   3. The workload SDK validates signature, binding, expiry, body digest, and
 *      replay before this backend handler sees the actor.
 *
 * The point of the demo: the backend-verified username is trustworthy even though
 * no bearer/user token passed through the untrusted frontend. The display context from
 * `usePrivosContext()` is shown alongside purely for comparison.
 */
import { usePrivosContext, usePrivosTool } from '@privos_ai/app-react';

interface WhoamiResult {
  verified: boolean;
  username?: string;
  userId?: string;
  roomId?: string;
  message?: string;
  error?: string;
}

export default function WhoamiPanel() {
  const { username: clientClaimedUsername, userId: clientClaimedUserId } = usePrivosContext();
  const { data, loading, error, refetch } = usePrivosTool<WhoamiResult>('hr_whoami', {});

  return (
    <div style={{ padding: 20, maxWidth: 640 }}>
      <h2 style={{ marginTop: 0 }}>Backend-verified identity</h2>
      <p style={{ opacity: 0.75, marginTop: -6 }}>
        The username below is carried in a body-bound Hub dispatch assertion verified by the app
        <strong> backend</strong>, not claimed by the frontend.
      </p>

      {loading && <div style={box('#334', '#eef')}>Verifying with backend&hellip;</div>}

      {error && <div style={box('#8a1f1f', '#fdecec')}>Tool call failed: {error.message}</div>}

      {data && data.verified && (
        <div style={box('#12633a', '#e7f7ee')}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{data.username}</div>
          <div style={{ fontFamily: 'monospace', fontSize: 13, opacity: 0.8 }}>userId: {data.userId}</div>
          <div style={{ marginTop: 8, fontSize: 13 }}>
            <span style={badge('#12633a')}>verified by backend</span>
            {data.roomId ? <span style={{ marginLeft: 10, opacity: 0.7 }}>room: {data.roomId}</span> : null}
          </div>
        </div>
      )}

      {data && !data.verified && (
        <div style={box('#8a1f1f', '#fdecec')}>
          <strong>Not verified.</strong> {data.error}
        </div>
      )}

      <details style={{ marginTop: 18 }}>
        <summary style={{ cursor: 'pointer', opacity: 0.8 }}>Client-claimed context (untrusted)</summary>
        <div style={{ fontFamily: 'monospace', fontSize: 13, marginTop: 8, opacity: 0.85 }}>
          <div>username: {clientClaimedUsername ?? '—'}</div>
          <div>userId: {clientClaimedUserId ?? '—'}</div>
          <div style={{ marginTop: 6, opacity: 0.7 }}>
            These values are safe for display and UI state. Backend authorization uses only the
            verified dispatch actor above.
          </div>
        </div>
      </details>

      <button type="button" onClick={refetch} style={{ marginTop: 16, padding: '8px 14px', cursor: 'pointer' }}>
        Re-verify
      </button>
    </div>
  );
}

function box(fg: string, bg: string): React.CSSProperties {
  return { border: `1px solid ${fg}33`, background: bg, color: fg, borderRadius: 8, padding: '12px 14px', marginTop: 12 };
}

function badge(fg: string): React.CSSProperties {
  return { background: `${fg}22`, color: fg, borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 600 };
}
