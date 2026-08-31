/**
 * Agent set upload — submit archives to the workspace factory, preview what
 * they contain, then commit the batch.
 *
 * Two calls through the SDK REST passthrough, gated by the
 * `sandbox:agent-sets:upload` scope:
 *   - preview: POST agents.sandbox.agentSets.preview { archives: [{fileName, base64}] }
 *   - confirm: POST agents.sandbox.agentSets.confirm { sessionId }
 *
 * Three things a publisher should copy from this panel:
 *
 * **The scope is not the authorisation.** It only widens which paths this app
 * may reach. The hub still requires the acting *user* to hold
 * `manage-privos-agent-sets`, which is admin-only, so a non-admin using an app
 * that holds the scope is refused server-side. Provenance records both the user
 * and the attested app.
 *
 * **Archives travel base64 in JSON, not multipart.** The hub relays a REST call
 * and never reassembles a multipart body. Base64 costs 4 bytes per 3, which the
 * relay's transport ceiling already accounts for.
 *
 * **The commit is all-or-nothing and its session is single-use.** A confirm that
 * reached the server consumed the session whether or not it succeeded, so there
 * is no "try again" on a preview — the archive has to be submitted afresh. This
 * panel therefore drops back to the upload step rather than offering a retry
 * that could only fail.
 */
import { useState } from 'react';
import { usePrivosApp } from '@privos_ai/app-react';
import { restCall } from '../privos-rest';
import sampleArchiveUrl from '../sample-agent-set.tar.gz?url';

interface PreviewItem {
  type: string;
  name: string;
  componentCount?: number;
}

/**
 * The sample set bundled with this app, so the demo needs no external file.
 * `sampleArchiveUrl` is the hashed, Vite-emitted `assets/` path — resolved
 * against `import.meta.url` under the relative build base, i.e. the same
 * tokened Hub path every other asset loads from. `SAMPLE_ARCHIVE` stays the
 * logical file name sent to the preview API; it must not carry the build hash.
 */
const SAMPLE_ARCHIVE = 'sample-agent-set.tar.gz';

async function toBase64(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  // Chunked so a large archive cannot blow the argument limit of String.
  const chunk = 0x8000;
  for (let i = 0; i < buffer.length; i += chunk) {
    binary += String.fromCharCode(...buffer.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export default function AgentSetUploadPanel() {
  const app = usePrivosApp();

  const [step, setStep] = useState<'upload' | 'preview' | 'working'>('upload');
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [archiveName, setArchiveName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  function reset() {
    setStep('upload');
    setItems([]);
    setSessionId(null);
    setArchiveName('');
  }

  async function submitForPreview(fileName: string, blob: Blob) {
    setStep('working');
    setError(null);
    setDoneMsg(null);
    try {
      const base64 = await toBase64(blob);
      const body = await restCall<{ sessionId?: string; items?: PreviewItem[] }>(
        app,
        'POST',
        'agents.sandbox.agentSets.preview',
        { body: { archives: [{ fileName, base64 }] } },
      );
      if (!body?.sessionId) throw new Error('The sandbox returned no upload session.');
      setSessionId(body.sessionId);
      setItems(Array.isArray(body.items) ? body.items : []);
      setArchiveName(fileName);
      setStep('preview');
    } catch (err: any) {
      // An admin-only endpoint: a non-admin lands here with the hub's refusal.
      setError(err?.message || 'Preview failed. Uploading agent sets is admin-only.');
      setStep('upload');
    }
  }

  async function useSample() {
    try {
      const res = await fetch(sampleArchiveUrl);
      if (!res.ok) throw new Error(`Could not read the bundled sample (${res.status}).`);
      await submitForPreview(SAMPLE_ARCHIVE, await res.blob());
    } catch (err: any) {
      setError(err?.message || 'Could not read the bundled sample.');
      setStep('upload');
    }
  }

  async function handleConfirm() {
    if (!sessionId) return;
    setStep('working');
    setError(null);
    try {
      const body = await restCall<{ items?: PreviewItem[] }>(app, 'POST', 'agents.sandbox.agentSets.confirm', {
        body: { sessionId },
      });
      const imported = Array.isArray(body?.items) ? body.items.length : items.length;
      setDoneMsg(`Imported ${imported} component(s). Select the set for this room on the Skills tab.`);
      reset();
    } catch (err: any) {
      // The session is gone either way, so the preview cannot be acted on again.
      setError(`${err?.message || 'The import failed.'} Nothing was imported — submit the archive again.`);
      reset();
    }
  }

  return (
    <div className="container">
      <h1>Agent set upload</h1>
      <p className="empty-text">
        Upload an agent set into the workspace factory. A set archive holds one wrapper directory
        with <code>skills/</code>, <code>commands/</code>, and <code>agents/</code> inside it.
        Uploading is admin-only, and the whole batch lands or none of it does.
      </p>

      {error && <div className="error-message">{error}</div>}
      {doneMsg && <div className="items-count">{doneMsg}</div>}

      {step === 'working' && <p className="loading-text">Working…</p>}

      {step === 'upload' && (
        <div className="form-actions" style={{ gap: 8 }}>
          <button type="button" className="btn-submit" onClick={useSample}>
            Preview the bundled sample set
          </button>
          <label className="btn-submit" style={{ cursor: 'pointer' }}>
            Choose an archive…
            <input
              type="file"
              accept=".zip,.tar,.gz,.tgz"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void submitForPreview(file.name, file);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      )}

      {step === 'preview' && (
        <>
          <h2>{archiveName}</h2>
          {items.length === 0 ? (
            <p className="empty-text">The archive contained nothing installable.</p>
          ) : (
            <ul className="file-list">
              {items.map((item) => (
                <li key={`${item.type}:${item.name}`} className="file-row">
                  <span className="file-name">
                    {item.name}
                    <span className="file-size" style={{ marginInlineStart: 8 }}>
                      {item.type}
                      {typeof item.componentCount === 'number' ? ` · ${item.componentCount} component(s)` : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="form-actions" style={{ gap: 8 }}>
            <button type="button" className="btn-submit" onClick={handleConfirm} disabled={items.length === 0}>
              Import {items.length} item(s)
            </button>
            <button type="button" className="btn-cancel-modal" onClick={reset}>
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
