/**
 * App Objects (CAS) — Step-1 generic platform contract (merged hub
 * `bff01ee8`, live only on tenant.132+): store/read one immutable,
 * room-private, content-addressed object through `mcpapp.objects.put` /
 * `.head` / `.get`.
 *
 * Unlike every other tab in this app, the frontend never talks to the Hub
 * directly for this: `db:read` / `db:write` are exercised with THIS APP'S
 * OWN installation-bot credential, not the current user's session. The
 * frontend calls this app's own backend tool `hr_app_object_store`
 * (`app-objects-demo-tool.ts`), which makes the bot-credential call
 * server-side (`app-platform-tool-call.ts`) — mirroring the reference
 * consumer legal-agent's `hub-db-object-store.ts`.
 *
 * The Hub independently verifies the digest of what it stores; this panel
 * also re-verifies the digest of what it reads back, client-side, on top of
 * the backend's own re-verification — belt and suspenders, end to end.
 */
import { useState } from 'react';
import { usePrivosApp, usePrivosContext, parseToolResult } from '@privos_ai/app-react';
import { textToBase64, base64ToText } from './app-objects-demo-helpers';

interface ObjectMetadata {
  digest: string;
  size: number;
  mediaType: string;
  createdAt: string;
  adopted: boolean;
}

interface PutResult extends ObjectMetadata {
  requestDigest: string;
}

interface GetResult extends ObjectMetadata {
  dataBase64: string;
  digestVerifiedLocally: boolean;
}

export default function AppObjectsPanel() {
  const app = usePrivosApp();
  const { roomId } = usePrivosContext();

  const [content, setContent] = useState('Hello from the App Objects demo.');
  const [mediaType, setMediaType] = useState('text/plain');
  const [digest, setDigest] = useState('');
  const [putResult, setPutResult] = useState<PutResult | null>(null);
  const [headResult, setHeadResult] = useState<ObjectMetadata | null>(null);
  const [getResult, setGetResult] = useState<GetResult | null>(null);
  const [decodedText, setDecodedText] = useState<string | null>(null);
  const [busy, setBusy] = useState<'put' | 'head' | 'get' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function callTool<T>(args: Record<string, unknown>): Promise<T> {
    return parseToolResult(await app.callServerTool({ name: 'hr_app_object_store', arguments: args })) as T;
  }

  async function put() {
    if (!roomId) {
      setError('No roomId in context yet — reopen the app inside a Room.');
      return;
    }
    setBusy('put');
    setError(null);
    setHeadResult(null);
    setGetResult(null);
    setDecodedText(null);
    try {
      const dataBase64 = textToBase64(content);
      const result = await callTool<PutResult>({ action: 'put', roomId, dataBase64, mediaType });
      setPutResult(result);
      setDigest(result.digest);
    } catch (err: any) {
      setError(err?.message || 'Failed to store the object.');
    } finally {
      setBusy(null);
    }
  }

  async function head() {
    if (!roomId || !digest.trim()) return;
    setBusy('head');
    setError(null);
    setGetResult(null);
    setDecodedText(null);
    try {
      setHeadResult(await callTool<ObjectMetadata>({ action: 'head', roomId, digest: digest.trim() }));
    } catch (err: any) {
      setError(err?.message || 'Failed to inspect the object.');
    } finally {
      setBusy(null);
    }
  }

  async function get() {
    if (!roomId || !digest.trim()) return;
    setBusy('get');
    setError(null);
    setHeadResult(null);
    try {
      const result = await callTool<GetResult>({ action: 'get', roomId, digest: digest.trim() });
      setGetResult(result);
      setDecodedText(base64ToText(result.dataBase64));
    } catch (err: any) {
      setError(err?.message || 'Failed to read the object.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="container">
      <h1>App Objects (CAS)</h1>
      <p className="empty-text">
        Code-ready against the Step-1 generic platform contract — live only once this room's Hub is
        on tenant.132+. Uses the optional <code>db:write</code> / <code>db:read</code> permissions,
        exercised here through this app's own installation-bot credential, not the current user's
        session.
      </p>

      <div className="form-group">
        <label htmlFor="objects-content">Content to store</label>
        <textarea id="objects-content" rows={3} value={content} onChange={(e) => setContent(e.target.value)} disabled={busy !== null} />
      </div>
      <div className="form-group">
        <label htmlFor="objects-media-type">Media type</label>
        <input id="objects-media-type" value={mediaType} onChange={(e) => setMediaType(e.target.value)} disabled={busy !== null} />
      </div>

      {error && <div className="error-message" role="alert">{error}</div>}

      <div className="form-actions">
        <button type="button" className="btn-submit" onClick={put} disabled={busy !== null || !roomId || !content.trim()}>
          {busy === 'put' ? 'Storing…' : 'Store object (mcpapp.objects.put)'}
        </button>
      </div>

      {putResult && (
        <ul className="file-list" aria-label="Stored object">
          <li className="file-row">
            <span className="file-name">Digest</span>
            <span className="file-size">{putResult.digest}</span>
          </li>
          <li className="file-row">
            <span className="file-name">Size</span>
            <span className="file-size">{putResult.size} bytes</span>
          </li>
          <li className="file-row">
            <span className="file-name">Adopted (already existed)</span>
            <span className="file-size">{putResult.adopted ? 'yes' : 'no'}</span>
          </li>
        </ul>
      )}

      <div className="form-group" style={{ marginTop: 16 }}>
        <label htmlFor="objects-digest">Digest to look up</label>
        <input id="objects-digest" value={digest} onChange={(e) => setDigest(e.target.value)} placeholder="sha256:…" disabled={busy !== null} />
      </div>

      <div className="form-actions">
        <button type="button" onClick={head} disabled={busy !== null || !roomId || !digest.trim()}>
          {busy === 'head' ? 'Checking…' : 'Head (metadata only)'}
        </button>
        <button type="button" onClick={get} disabled={busy !== null || !roomId || !digest.trim()}>
          {busy === 'get' ? 'Reading…' : 'Get (metadata + content)'}
        </button>
      </div>

      {headResult && (
        <ul className="file-list" aria-label="Object metadata">
          <li className="file-row">
            <span className="file-name">Media type</span>
            <span className="file-size">{headResult.mediaType}</span>
          </li>
          <li className="file-row">
            <span className="file-name">Size</span>
            <span className="file-size">{headResult.size} bytes</span>
          </li>
          <li className="file-row">
            <span className="file-name">Created</span>
            <span className="file-size">{headResult.createdAt}</span>
          </li>
        </ul>
      )}

      {getResult && (
        <>
          <div className={getResult.digestVerifiedLocally ? 'items-count' : 'error-message'} role="status" style={{ marginTop: 12 }}>
            {getResult.digestVerifiedLocally
              ? 'Digest re-verified locally — the returned bytes hash to the same sha256 digest.'
              : 'Digest mismatch on local re-verification — this should never happen.'}
          </div>
          {decodedText !== null && (
            <details className="chat-json-block" style={{ marginTop: 12 }} open>
              <summary>Decoded content</summary>
              <pre className="chat-json-pre"><code>{decodedText}</code></pre>
            </details>
          )}
        </>
      )}
    </section>
  );
}
