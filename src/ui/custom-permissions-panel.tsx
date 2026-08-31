/**
 * Custom Permissions demo.
 *
 * Room owners/admins define per-room custom permissions and assign them to members;
 * an isolated-list item then grants read/edit to holders of those permissions via the
 * `additionalReaders` / `additionalEditors` fields. This panel walks the full loop:
 *
 *   Setup (current-user REST, owner/admin — no app scope):
 *     - POST rooms.customPermissions.create   — mint a demo permission ("Legal").
 *     - POST rooms.customPermissions.assign    — assign it to a member.
 *   Read (scope `custom-permissions:read`):
 *     - mcpapp.rooms.customPermissions.list     — the room catalog.
 *     - mcpapp.rooms.customPermissions.members  — who holds the permission.
 *   Grant (scope `custom-permissions:write`):
 *     - mcpapp.lists.create / createItem              — an isolated list + item.
 *     - mcpapp.rooms.customPermissions.setItemAccess  — grant the item to the permission.
 *
 * setItemAccess still requires the acting user to be room owner/admin, and every id must
 * exist in the room catalog — the Hub enforces both regardless of the granted scope.
 */
import { useState } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';

import { parseUserIdList } from './assignee-demo-helpers';
import { buildItemAccessPatch, grantIncludes, findPermissionName, type CustomPermissionRef } from './custom-permissions-helpers';
import { restCall, safeFeatureError } from './privos-rest';

interface MemberRef {
  _id: string;
  username?: string;
  name?: string;
}
interface ListRef {
  _id: string;
  name: string;
}
interface StepLog {
  step: string;
  ok: boolean;
  detail: string;
}

function parseToolResult<T>(result: unknown): T {
  const text = (result as { content?: { text?: string }[] })?.content?.[0]?.text;
  return (typeof text === 'string' ? JSON.parse(text) : result) as T;
}

export default function CustomPermissionsPanel() {
  const app = usePrivosApp();
  const { roomId, userId, effectiveScopes } = usePrivosContext();
  const canRead = effectiveScopes?.includes('custom-permissions:read') === true;
  const canWrite = effectiveScopes?.includes('custom-permissions:write') === true;

  const [permName, setPermName] = useState('Legal');
  const [assigneeId, setAssigneeId] = useState(userId || '');
  const [asEditor, setAsEditor] = useState(true);
  const [catalog, setCatalog] = useState<CustomPermissionRef[]>([]);
  const [members, setMembers] = useState<Record<string, MemberRef[]>>({});
  const [grantResult, setGrantResult] = useState<{
    itemId: string;
    permissionId: string;
    before: { additionalReaders: string[]; additionalEditors: string[] };
    after: { additionalReaders: string[]; additionalEditors: string[] };
  } | null>(null);
  const [logs, setLogs] = useState<StepLog[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    return parseToolResult<T>(await app.callServerTool({ name, arguments: args }));
  }

  // Read the room catalog (scope custom-permissions:read) and, for each permission, its holders.
  async function refreshCatalog() {
    if (!roomId) {
      setError('No roomId in context yet — reopen the app inside a Room.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const permissions = await callTool<CustomPermissionRef[]>('mcpapp.rooms.customPermissions.list', { roomId });
      setCatalog(permissions);
      const memberMap: Record<string, MemberRef[]> = {};
      for (const p of permissions) {
        // eslint-disable-next-line no-await-in-loop -- small catalog; sequential keeps the demo output readable
        memberMap[p._id] = await callTool<MemberRef[]>('mcpapp.rooms.customPermissions.members', { roomId, permissionId: p._id });
      }
      setMembers(memberMap);
    } catch (e) {
      setError(safeFeatureError(e, 'Could not read the room custom-permission catalog.'));
    } finally {
      setBusy(false);
    }
  }

  // Owner/admin setup via current-user REST: mint a permission and assign it to a member.
  // These endpoints run as the current user and need no app scope.
  async function createAndAssign() {
    if (!roomId) {
      setError('No roomId in context yet — reopen the app inside a Room.');
      return;
    }
    const name = permName.trim();
    if (!name) {
      setError('Enter a permission name.');
      return;
    }
    setBusy(true);
    setError(null);
    const next: StepLog[] = [];
    const log = (step: string, ok: boolean, detail: string) => {
      next.push({ step, ok, detail });
      setLogs([...next]);
    };
    try {
      // No `v1/` prefix on the path — the host bridge adds it, matching every other panel's
      // `restCall` call sites (`items.create`, `ai-messages.startGeneration`, etc.); a literal
      // `/v1/...` here would double the prefix and 404.
      const created = await restCall<{ permission: CustomPermissionRef }>(app, 'POST', 'rooms.customPermissions.create', {
        body: { roomId, name },
      });
      log('Create permission', true, `"${created.permission.name}" (${created.permission._id}).`);
      const memberIds = parseUserIdList(assigneeId);
      for (const memberId of memberIds) {
        // eslint-disable-next-line no-await-in-loop -- small member list; sequential keeps the demo output readable
        await restCall(app, 'POST', 'rooms.customPermissions.assign', {
          body: { roomId, userId: memberId, permissionId: created.permission._id },
        });
        log('Assign to member', true, `Assigned to ${memberId}.`);
      }
      await refreshCatalog();
    } catch (e) {
      log('Setup', false, safeFeatureError(e, 'Setup failed (owner/admin only).'));
      setError(safeFeatureError(e, 'Setup failed — creating/assigning a permission is room owner/admin only.'));
    } finally {
      setBusy(false);
    }
  }

  // Grant an isolated item to a permission (scope custom-permissions:write).
  async function grantItemAccess(permissionId: string) {
    if (!roomId) {
      setError('No roomId in context yet — reopen the app inside a Room.');
      return;
    }
    setBusy(true);
    setError(null);
    const next: StepLog[] = [];
    const log = (step: string, ok: boolean, detail: string) => {
      next.push({ step, ok, detail });
      setLogs([...next]);
    };
    try {
      // `mcpapp.lists.create` returns `{ list, stages }` — there is no `defaultStage` field —
      // and `mcpapp.lists.createItem` takes no `stageId` input at all; the Hub always files a
      // new item into the list's first stage itself
      // (`apps/meteor/server/services/mcp-tool-handlers-lists.ts`).
      const created = await callTool<{ list: ListRef; stages: { _id: string }[] }>('mcpapp.lists.create', {
        name: 'Custom-permission grant demo',
        roomId,
        isolatedList: true,
      });
      const list = created.list;
      log('1. Create isolated list', true, `"${list.name}" (${list._id}).`);

      // `createItem` returns a bare `{ _id, name, listId }` — no wrapper key.
      const createdItem = await callTool<{ _id: string; name: string }>('mcpapp.lists.createItem', {
        listId: list._id,
        title: 'Item granted to a custom permission',
      });
      const before = { additionalReaders: [] as string[], additionalEditors: [] as string[] };
      log('2. Create item', true, `"${createdItem.name}" (${createdItem._id}). No additionalReaders/additionalEditors yet.`);

      // The write path: grant the permission's holders read (or read+edit) on this item.
      // buildItemAccessPatch merges into existing grants — here the item is fresh, so it
      // starts empty. `asReader` is implied by `asEditor` (edit implies read on the Hub),
      // so a read-only grant sets additionalReaders and an editor grant sets additionalEditors.
      const patch = buildItemAccessPatch(permissionId, {}, { asReader: !asEditor, asEditor });
      const grant = await callTool<{ updated: boolean; itemId: string }>('mcpapp.rooms.customPermissions.setItemAccess', {
        itemId: createdItem._id,
        ...patch,
      });
      log('3. setItemAccess', grant.updated === true, `Granted "${findPermissionName(catalog, permissionId)}" as ${asEditor ? 'an additional editor' : 'an additional reader'}.`);

      // Read the item back to confirm the grant was actually stored, not just sent.
      const itemsResult = await callTool<{ items: { _id: string; additionalReaders?: string[]; additionalEditors?: string[] }[] }>(
        'mcpapp.lists.getItems',
        { listId: list._id },
      );
      const after = itemsResult.items?.find((i) => i._id === createdItem._id);
      const confirmed = grantIncludes(after?.additionalReaders, permissionId) || grantIncludes(after?.additionalEditors, permissionId);
      log(
        '4. Read back and confirm',
        confirmed,
        confirmed
          ? `Confirmed: additionalReaders [${(after?.additionalReaders || []).join(', ')}], additionalEditors [${(after?.additionalEditors || []).join(', ')}].`
          : 'Mismatch — the read-back item does not list this permission id.',
      );
      setGrantResult({
        itemId: createdItem._id,
        permissionId,
        before,
        after: { additionalReaders: after?.additionalReaders ?? [], additionalEditors: after?.additionalEditors ?? [] },
      });
      log(
        'Result',
        true,
        `A holder of this permission can now ${asEditor ? 'read AND edit' : 'read'} the item — even though they are neither its creator nor an assignee.`,
      );
    } catch (e) {
      log('Grant', false, safeFeatureError(e, 'setItemAccess failed (room owner/admin only).'));
      setError(safeFeatureError(e, 'Granting item access failed — the Hub requires you to be room owner/admin.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <h1>Custom permissions</h1>
      <p className="empty-text">
        Per-room custom permissions grant read/edit on isolated-list items to their holders, beyond the item&apos;s creator,
        assignees, and the room owner/admin. Owners/admins mint and assign permissions (current-user REST); this app reads the
        catalog (<code>custom-permissions:read</code>) and grants an item to a permission (<code>custom-permissions:write</code>).
      </p>

      {!roomId && <p className="empty-text">Reopen the app inside a Room to use this demo.</p>}

      <h2>Setup (owner/admin, current-user REST)</h2>
      <div className="form-group">
        <label htmlFor="cp-name">Permission name</label>
        <input id="cp-name" type="text" value={permName} onChange={(e) => setPermName(e.target.value)} disabled={busy || !roomId} />
      </div>
      <div className="form-group">
        <label htmlFor="cp-assignee">Assign to member user id(s) — comma or space separated, optional</label>
        <input
          id="cp-assignee"
          type="text"
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          placeholder="userId1, userId2"
          disabled={busy || !roomId}
        />
      </div>
      <div className="form-actions">
        <button type="button" className="btn-submit" onClick={createAndAssign} disabled={busy || !roomId}>
          {busy ? 'Working…' : 'Create & assign permission'}
        </button>
      </div>

      <h2>Read the catalog (custom-permissions:read)</h2>
      <div className="form-actions">
        <button type="button" onClick={refreshCatalog} disabled={busy || !roomId || !canRead}>
          {canRead ? 'Read room catalog' : 'custom-permissions:read not granted'}
        </button>
      </div>
      <div className="form-group">
        <label htmlFor="cp-as-editor">
          <input id="cp-as-editor" type="checkbox" checked={asEditor} onChange={(e) => setAsEditor(e.target.checked)} /> Grant as
          editor (unchecked = read-only)
        </label>
      </div>

      {catalog.length === 0 ? (
        <p className="empty-text">No custom permissions loaded yet.</p>
      ) : (
        <div className="items-table-wrapper">
          <table className="items-table">
            <thead>
              <tr>
                <th>Permission</th>
                <th>Members</th>
                <th>Grant (custom-permissions:write)</th>
              </tr>
            </thead>
            <tbody>
              {catalog.map((p) => (
                <tr key={p._id}>
                  <td title={p._id}>{p.name}</td>
                  <td>{(members[p._id] ?? []).map((m) => m.username || m.name || m._id).join(', ') || 'none'}</td>
                  <td>
                    <button type="button" onClick={() => grantItemAccess(p._id)} disabled={busy || !canWrite}>
                      {canWrite ? 'Grant a demo item →' : 'write not granted'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {grantResult && (
        <div className="items-count" style={{ marginTop: 12 }}>
          Item <code>{grantResult.itemId}</code> — before: additionalReaders [{grantResult.before.additionalReaders.join(', ') || 'none'}],
          additionalEditors [{grantResult.before.additionalEditors.join(', ') || 'none'}]. After: additionalReaders [
          {grantResult.after.additionalReaders.join(', ') || 'none'}], additionalEditors [{grantResult.after.additionalEditors.join(', ') || 'none'}].{' '}
          A holder of <strong>{findPermissionName(catalog, grantResult.permissionId)}</strong> can now{' '}
          {grantIncludes(grantResult.after.additionalEditors, grantResult.permissionId) ? 'read AND edit' : 'read'} this item — even
          though they are neither its creator nor an assignee.
        </div>
      )}

      {logs.length > 0 && (
        <ul className="file-list" aria-label="Demo steps" style={{ marginTop: 16 }}>
          {logs.map((l, i) => (
            // eslint-disable-next-line react/no-array-index-key -- append-only demo log
            <li key={i} className="file-row">
              <span className="file-name">{l.ok ? '✓' : '✗'} {l.step}</span>
              <span className="file-size">{l.detail}</span>
            </li>
          ))}
        </ul>
      )}

      {error && <div className="error-message" role="alert">{error}</div>}
    </div>
  );
}
