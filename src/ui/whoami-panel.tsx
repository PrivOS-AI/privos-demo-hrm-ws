/**
 * "Who am I" panel — demonstrates hub-signed user identity end-to-end.
 *
 * Flow:
 *   1. The hub mints a short-lived RS256 JWT and pushes it to this iframe; we read
 *      it with `usePrivosUserToken()`.
 *   2. We forward that token to our OWN backend tool `hr_whoami` (via the relay).
 *   3. The backend VERIFIES it against the hub JWKS and returns the username it can
 *      cryptographically vouch for — see src/verify-privos-user.ts.
 *
 * The point of the demo: the backend-verified username is trustworthy even though
 * the token was relayed through the (untrusted) frontend, because the app can only
 * verify — never forge — a hub signature. The client-claimed username from
 * `usePrivosContext()` is shown alongside purely for comparison.
 */
import { usePrivosContext, usePrivosUserToken, usePrivosTool } from '@privos/app-react';

interface WhoamiResult {
  verified: boolean;
  username?: string;
  userId?: string;
  appId?: string;
  roomId?: string;
  expiresAt?: number;
  message?: string;
  error?: string;
}

export default function WhoamiPanel() {
  const { username: clientClaimedUsername, userId: clientClaimedUserId } = usePrivosContext();
  const userToken = usePrivosUserToken();
  const { data, loading, error, refetch } = usePrivosTool<WhoamiResult>('hr_whoami', { userToken: userToken ?? '' });

  const expiresIn = data?.expiresAt ? Math.max(0, data.expiresAt - Math.floor(Date.now() / 1000)) : null;

  return (
    <div style={{ padding: 20, maxWidth: 640 }}>
      <h2 style={{ marginTop: 0 }}>Backend-verified identity</h2>
      <p style={{ opacity: 0.75, marginTop: -6 }}>
        The username below is validated by the app <strong>backend</strong> against the hub&rsquo;s public JWKS —
        not merely claimed by the frontend.
      </p>

      {!userToken && (
        <div style={box('#7a5900', '#fff7e0')}>
          No user token in host context. The hub this app is paired to may predate signed user tokens,
          or context hasn&rsquo;t arrived yet.
        </div>
      )}

      {loading && <div style={box('#334', '#eef')}>Verifying with backend&hellip;</div>}

      {error && <div style={box('#8a1f1f', '#fdecec')}>Tool call failed: {error.message}</div>}

      {data && data.verified && (
        <div style={box('#12633a', '#e7f7ee')}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{data.username}</div>
          <div style={{ fontFamily: 'monospace', fontSize: 13, opacity: 0.8 }}>userId: {data.userId}</div>
          <div style={{ marginTop: 8, fontSize: 13 }}>
            <span style={badge('#12633a')}>verified by backend</span>
            {data.appId ? <span style={{ marginLeft: 10, opacity: 0.7 }}>aud: {data.appId}</span> : null}
            {expiresIn !== null ? <span style={{ marginLeft: 10, opacity: 0.7 }}>expires in {expiresIn}s</span> : null}
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
            These come straight from the host context and would be forgeable on their own — only the
            backend-verified block above is trustworthy.
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
