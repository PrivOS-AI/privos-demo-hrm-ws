/**
 * Persistent storage panel — demonstrates `app.storage`, the host-mediated
 * per-app key/value store.
 *
 * The app iframe's own `localStorage` does not survive its opaque origin between
 * sessions; this proxies to the Hub, which stores values under a per-app
 * namespace (`mcp-app:{appId}:{key}`) it stamps itself — so the value written
 * here is invisible to, and unwritable by, every other installed app. Set a
 * value, reload the tab, and read it back to see it persist.
 */
import { useState } from 'react';
import { usePrivosApp } from '@privos_ai/app-react';

export default function StoragePanel() {
  const app = usePrivosApp();
  const storage = app.storage;
  const [key, setKey] = useState('demo:note');
  const [value, setValue] = useState('');
  const [readback, setReadback] = useState<string | null | undefined>(undefined);
  const [status, setStatus] = useState<string>('');

  const run = async (label: string, fn: () => Promise<void>) => {
    setStatus(`${label}…`);
    try {
      await fn();
      setStatus(`${label} ✓`);
    } catch (err) {
      setStatus(`${label} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 640 }}>
      <h2 style={{ marginTop: 0 }}>Persistent storage (per-app)</h2>
      <p style={{ opacity: 0.75, marginTop: -6 }}>
        Host-backed key/value store, isolated to this app by its <code>appId</code>. Survives reloads;
        per browser profile, not synced across devices. Use the server as the source of truth for
        anything that must follow the user.
      </p>

      <label style={{ display: 'block', fontSize: 13, marginTop: 12 }}>Key</label>
      <input value={key} onChange={(e) => setKey(e.target.value)} style={input} />

      <label style={{ display: 'block', fontSize: 13, marginTop: 12 }}>Value</label>
      <input value={value} onChange={(e) => setValue(e.target.value)} style={input} />

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <button type="button" style={btn} onClick={() => run('Set', () => storage.set(key, value))}>
          Set
        </button>
        <button
          type="button"
          style={btn}
          onClick={() => run('Get', async () => setReadback(await storage.get(key)))}
        >
          Get
        </button>
        <button type="button" style={btn} onClick={() => run('Remove', () => storage.remove(key))}>
          Remove
        </button>
      </div>

      {readback !== undefined && (
        <div style={{ marginTop: 14, fontFamily: 'monospace', fontSize: 13 }}>
          get(&quot;{key}&quot;) → {readback === null ? <em>null (not set)</em> : JSON.stringify(readback)}
        </div>
      )}
      {status && <div style={{ marginTop: 10, fontSize: 13, opacity: 0.8 }}>{status}</div>}
    </div>
  );
}

const input: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid #cbd',
  fontSize: 14,
  boxSizing: 'border-box',
};

const btn: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 6,
  border: '1px solid #4356',
  background: '#eef',
  cursor: 'pointer',
  fontSize: 14,
};
