/**
 * App Database — Step-1 generic platform contract (merged hub `bff01ee8`,
 * live only on tenant.132+): a room-scoped app-owned collection through
 * `mcpapp.db.registerCollection` / `.create` / `.query` / `.getSchema`.
 *
 * Same backend-bot-credential path as the App Objects tab (see that panel's
 * header comment) — this app's own tool `hr_app_db_store`
 * (`app-db-demo-tool.ts`) makes the actual `mcpapp.db.*` calls server-side
 * with this app's installation-bot credential, never the current user's
 * session. Uses the optional `db:schema:write` / `db:schema:read` /
 * `db:write` / `db:read` permissions.
 */
import { useState } from 'react';
import { usePrivosApp, usePrivosContext, parseToolResult } from '@privos_ai/app-react';

interface DbRecord {
  _id: string;
  label: string;
  note?: string;
  _createdAt: string;
}

interface RegisterResult {
  registered: boolean;
  alreadyRegistered: boolean;
}

interface QueryResult {
  records: DbRecord[];
}

export default function AppDbPanel() {
  const app = usePrivosApp();
  const { roomId } = usePrivosContext();

  const [label, setLabel] = useState('First demo record');
  const [note, setNote] = useState('Created from the App Database demo tab.');
  const [registered, setRegistered] = useState<RegisterResult | null>(null);
  const [records, setRecords] = useState<DbRecord[] | null>(null);
  const [schema, setSchema] = useState<unknown>(null);
  const [busy, setBusy] = useState<'register' | 'create' | 'query' | 'schema' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function callTool<T>(args: Record<string, unknown>): Promise<T> {
    return parseToolResult(await app.callServerTool({ name: 'hr_app_db_store', arguments: args })) as T;
  }

  async function register() {
    if (!roomId) {
      setError('No roomId in context yet — reopen the app inside a Room.');
      return;
    }
    setBusy('register');
    setError(null);
    try {
      setRegistered(await callTool<RegisterResult>({ action: 'registerCollection', roomId }));
    } catch (err: any) {
      setError(err?.message || 'Failed to register the demo collection.');
    } finally {
      setBusy(null);
    }
  }

  async function query() {
    if (!roomId) return;
    setBusy('query');
    setError(null);
    try {
      const result = await callTool<QueryResult>({ action: 'query', roomId });
      setRecords(result.records);
    } catch (err: any) {
      setError(err?.message || 'Failed to query records.');
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    if (!roomId || !label.trim()) return;
    setBusy('create');
    setError(null);
    try {
      await callTool<DbRecord>({ action: 'create', roomId, label: label.trim(), note: note.trim() });
      await query();
    } catch (err: any) {
      setError(err?.message || 'Failed to create the record.');
    } finally {
      setBusy(null);
    }
  }

  async function getSchema() {
    if (!roomId) return;
    setBusy('schema');
    setError(null);
    try {
      setSchema(await callTool({ action: 'getSchema', roomId }));
    } catch (err: any) {
      setError(err?.message || 'Failed to read the schema.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="container">
      <h1>App Database</h1>
      <p className="empty-text">
        Code-ready against the Step-1 generic platform contract — live only once this room's Hub is
        on tenant.132+. A fixed demo collection, registered once per room, then a create/query/schema
        round trip.
      </p>

      {error && <div className="error-message" role="alert">{error}</div>}

      <div className="form-actions">
        <button type="button" className="btn-submit" onClick={register} disabled={busy !== null || !roomId}>
          {busy === 'register' ? 'Registering…' : '1. Register collection (mcpapp.db.registerCollection)'}
        </button>
      </div>

      {registered && (
        <div className="items-count" role="status">
          {registered.alreadyRegistered ? 'Already registered in this room.' : 'Registered.'}
        </div>
      )}

      <div className="form-group" style={{ marginTop: 16 }}>
        <label htmlFor="db-record-label">Label</label>
        <input id="db-record-label" value={label} onChange={(e) => setLabel(e.target.value)} disabled={busy !== null} />
      </div>
      <div className="form-group">
        <label htmlFor="db-record-note">Note</label>
        <input id="db-record-note" value={note} onChange={(e) => setNote(e.target.value)} disabled={busy !== null} />
      </div>

      <div className="form-actions">
        <button type="button" onClick={create} disabled={busy !== null || !roomId || !label.trim()}>
          {busy === 'create' ? 'Creating…' : '2. Create record (mcpapp.db.create)'}
        </button>
        <button type="button" onClick={query} disabled={busy !== null || !roomId}>
          {busy === 'query' ? 'Querying…' : '3. Query records (mcpapp.db.query)'}
        </button>
        <button type="button" onClick={getSchema} disabled={busy !== null || !roomId}>
          {busy === 'schema' ? 'Reading…' : '4. Get schema (mcpapp.db.getSchema)'}
        </button>
      </div>

      {records && records.length === 0 && <div className="items-count">No records yet — create one above.</div>}

      {records && records.length > 0 && (
        <ul className="file-list" aria-label="Demo records">
          {records.map((record) => (
            <li key={record._id} className="file-row">
              <span className="file-name">{record.label}</span>
              <span className="file-size">{record.note || '—'}</span>
            </li>
          ))}
        </ul>
      )}

      {schema != null && (
        <details className="chat-json-block" style={{ marginTop: 12 }} open>
          <summary>Collection schema</summary>
          <pre className="chat-json-pre"><code>{JSON.stringify(schema, null, 2)}</code></pre>
        </details>
      )}
    </section>
  );
}
