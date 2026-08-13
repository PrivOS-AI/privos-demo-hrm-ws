/**
 * Skills panel — list what the PrivOS Sandbox offers this room and choose what
 * is enabled for it.
 *
 * Both calls go through the SDK REST passthrough (`app.rest()`), gated by the
 * `sandbox:skills:use` scope (declare it in package.json `scopes`):
 *   - list:   POST rooms.listPrivOSSandboxSkills { rid, useGlobal: true }
 *   - select: POST rooms.syncPrivOSSandboxSkills { rid, componentIds, agentSetIds }
 *
 * The list mixes two kinds of thing. A **skill** is one standalone component. An
 * **agent set** is a group of skills, commands, and agents that installs as one
 * unit into its own directory, and is selected and removed as a unit. They are
 * shown apart because the choice differs: selecting a set brings everything
 * inside it.
 *
 * Each array is the complete desired selection *for its own kind*, so both are
 * always sent. Omitting one means "leave that kind alone" — a distinction worth
 * knowing about, because sending an empty array instead uninstalls every set in
 * the project, which now removes whole directories.
 *
 * Note: the select call additionally requires the logged-in user to have the
 * room's `edit-room` permission (room admin) — the hub enforces that server-side,
 * so a non-admin viewer will get a permission error from "Save".
 */
import { useState, useEffect, useCallback } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import { restCall } from './privos-rest';

interface SandboxComponent {
  id: string;
  name: string;
  description?: string;
  /** `agent_set` marks a group; anything else is a standalone skill. */
  type?: 'skill' | 'agent_set';
}

export default function SkillsPanel() {
  const app = usePrivosApp();
  const { roomId } = usePrivosContext();

  const [components, setComponents] = useState<SandboxComponent[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [selectedSets, setSelectedSets] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // 1. List what this room can enable (uses the global sandbox creds).
  const loadComponents = useCallback(async () => {
    if (!roomId) return;
    setLoading(true);
    setError(null);
    try {
      const body = await restCall<{ skills?: SandboxComponent[] }>(app, 'POST', 'rooms.listPrivOSSandboxSkills', {
        body: { rid: roomId, useGlobal: true },
      });
      setComponents(Array.isArray(body?.skills) ? body.skills : []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load skills.');
    } finally {
      setLoading(false);
    }
  }, [app, roomId]);

  useEffect(() => { loadComponents(); }, [loadComponents]);

  const toggle = (setter: typeof setSelectedSkills) => (id: string) =>
    setter((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleSkill = toggle(setSelectedSkills);
  const toggleSet = toggle(setSelectedSets);

  const skills = components.filter((c) => c.type !== 'agent_set');
  const agentSets = components.filter((c) => c.type === 'agent_set');

  // 2. Save the selection for this room (room admin only — enforced server-side).
  async function handleSave() {
    if (!roomId) return;
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const res = await restCall<{ succeeded?: number; failed?: number }>(app, 'POST', 'rooms.syncPrivOSSandboxSkills', {
        body: {
          rid: roomId,
          componentIds: Array.from(selectedSkills),
          agentSetIds: Array.from(selectedSets),
        },
      });
      setSavedMsg(`Saved — ${res?.succeeded ?? 0} project(s) synced${res?.failed ? `, ${res.failed} failed` : ''}.`);
    } catch (err: any) {
      // A non-admin viewer hits the room's edit-room check here.
      setError(err?.message || 'Failed to save skills (room admin required).');
    } finally {
      setSaving(false);
    }
  }

  function renderRow(component: SandboxComponent, checked: boolean, onToggle: (id: string) => void, badge?: string) {
    return (
      <li key={component.id} className="file-row file-row-clickable" onClick={() => onToggle(component.id)}>
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggle(component.id)}
          onClick={(e) => e.stopPropagation()}
        />
        <span className="file-name" style={{ marginInlineStart: 8 }}>
          {component.name}
          {badge ? <span className="file-size" style={{ marginInlineStart: 8 }}>{badge}</span> : null}
          {component.description ? <span className="file-size" style={{ display: 'block' }}>{component.description}</span> : null}
        </span>
      </li>
    );
  }

  return (
    <div className="container">
      <h1>Skills</h1>
      <p className="empty-text">Choose what the PrivOS Sandbox enables for this room.</p>

      {error && <div className="error-message">{error}</div>}
      {savedMsg && <div className="items-count">{savedMsg}</div>}

      {loading ? (
        <p className="loading-text">Loading…</p>
      ) : (
        <>
          <h2>Agent sets</h2>
          <p className="empty-text">
            A set installs as one unit into its own directory. Selecting it brings every skill,
            command, and agent inside it; clearing it removes the whole set.
          </p>
          {agentSets.length === 0 ? (
            <p className="empty-text">No agent sets available from the sandbox.</p>
          ) : (
            <ul className="file-list">
              {agentSets.map((s) => renderRow(s, selectedSets.has(s.id), toggleSet, 'agent set'))}
            </ul>
          )}

          <h2>Standalone skills</h2>
          {skills.length === 0 ? (
            <p className="empty-text">No standalone skills available from the sandbox.</p>
          ) : (
            <ul className="file-list">
              {skills.map((s) => renderRow(s, selectedSkills.has(s.id), toggleSkill))}
            </ul>
          )}
        </>
      )}

      <div className="form-actions">
        <button type="button" className="btn-submit" onClick={handleSave} disabled={saving || loading}>
          {saving ? 'Saving...' : 'Save selection'}
        </button>
      </div>
    </div>
  );
}
