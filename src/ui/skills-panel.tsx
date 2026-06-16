/**
 * Skills panel — list the PrivOS Sandbox skills available to this room and select
 * which ones are enabled for it.
 *
 * Both calls go through the SDK REST passthrough (`app.rest()`), gated by the
 * `sandbox:skills:use` scope (declare it in package.json `scopes`):
 *   - list:   POST rooms.listPrivOSSandboxSkills { rid, useGlobal: true }
 *   - select: POST rooms.syncPrivOSSandboxSkills { rid, componentIds: [...] }
 *
 * Note: the select call additionally requires the logged-in user to have the
 * room's `edit-room` permission (room admin) — the hub enforces that server-side,
 * so a non-admin viewer will get a permission error from "Save".
 */
import { useState, useEffect, useCallback } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos/app-react';
import { restCall } from './privos-rest';

interface Skill {
  id: string;
  name: string;
  description?: string;
}

export default function SkillsPanel() {
  const app = usePrivosApp();
  const { roomId } = usePrivosContext();

  const [skills, setSkills] = useState<Skill[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // 1. List the skills available to this room (uses the global sandbox creds).
  const loadSkills = useCallback(async () => {
    if (!roomId) return;
    setLoading(true);
    setError(null);
    try {
      const body = await restCall<{ skills?: Skill[] }>(app, 'POST', 'rooms.listPrivOSSandboxSkills', {
        body: { rid: roomId, useGlobal: true },
      });
      setSkills(Array.isArray(body?.skills) ? body.skills : []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load skills.');
    } finally {
      setLoading(false);
    }
  }, [app, roomId]);

  useEffect(() => { loadSkills(); }, [loadSkills]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // 2. Save the selection for this room (room admin only — enforced server-side).
  async function handleSave() {
    if (!roomId) return;
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const res = await restCall<{ succeeded?: number; failed?: number }>(app, 'POST', 'rooms.syncPrivOSSandboxSkills', {
        body: { rid: roomId, componentIds: Array.from(selected) },
      });
      setSavedMsg(`Saved — ${res?.succeeded ?? 0} project(s) synced${res?.failed ? `, ${res.failed} failed` : ''}.`);
    } catch (err: any) {
      // A non-admin viewer hits the room's edit-room check here.
      setError(err?.message || 'Failed to save skills (room admin required).');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container">
      <h1>Skills</h1>
      <p className="empty-text">Select which PrivOS Sandbox skills are enabled for this room.</p>

      {error && <div className="error-message">{error}</div>}
      {savedMsg && <div className="items-count">{savedMsg}</div>}

      {loading ? (
        <p className="loading-text">Loading skills...</p>
      ) : skills.length === 0 ? (
        <p className="empty-text">No skills available from the sandbox.</p>
      ) : (
        <ul className="file-list">
          {skills.map((s) => (
            <li key={s.id} className="file-row file-row-clickable" onClick={() => toggle(s.id)}>
              <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} onClick={(e) => e.stopPropagation()} />
              <span className="file-name" style={{ marginInlineStart: 8 }}>
                {s.name}
                {s.description ? <span className="file-size" style={{ display: 'block' }}>{s.description}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="form-actions">
        <button type="button" className="btn-submit" onClick={handleSave} disabled={saving || loading}>
          {saving ? 'Saving...' : 'Save selection'}
        </button>
      </div>
    </div>
  );
}
