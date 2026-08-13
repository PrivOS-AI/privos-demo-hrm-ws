/**
 * Isolated list, multi-user ASSIGNEE demo.
 *
 * Runs the full flow through the Hub's list MCP tools (`app.callServerTool`,
 * same host bridge as `agent-bot-panel.tsx`), gated by the already-declared
 * `lists:write` (+ `lists:read`) permissions — no new scope is requested:
 *
 *   1. `mcpapp.lists.create`        — create a list with `isolatedList: true`.
 *   2. `mcpapp.lists.addField`      — add a field of type `ASSIGNEE`.
 *   3. `mcpapp.lists.createItem`    — create an item on that list.
 *   4. `mcpapp.lists.updateCustomField` — assign SEVERAL users at once by
 *       writing an array of user ids to the ASSIGNEE field.
 *   5. `mcpapp.lists.getItems`      — read the item back and confirm the
 *       stored value resolves to the same user ids that were assigned.
 *
 * Why step 2's field type matters: for an isolated list, the Hub decides who
 * may see an item from three things — room owner/admin, the item's creator,
 * and whoever is listed in its ASSIGNEE field(s). There is no `USER_SELECT`
 * or `MEMBER_SELECT` field type in the Hub; some older docs name those, but
 * `ASSIGNEE` is the only field type that puts a user on that visibility list.
 * See README.md "Isolated list, multi-user assignment demo" for the two-account
 * verification steps and the argument-shape caveat for the five tool calls
 * above (this app has no live Hub to confirm exact parameter names against).
 */
import { useState } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import { buildAssigneeValue, normalizeAssignedUserIds, assignedIdsMatch, parseUserIdList } from './assignee-demo-helpers';

const ASSIGNEE_FIELD_NAME = 'Assignees';

interface ListRef { _id: string; name: string; defaultStage?: { _id: string } }
interface FieldRef { _id: string; name: string; type: string }
interface ItemRef { _id: string; name: string; customFields?: { fieldId: string; value: unknown }[] }

interface StepLog { step: string; ok: boolean; detail: string; raw?: unknown }

function parseToolResult<T>(result: unknown): T {
  const text = (result as { content?: { text?: string }[] })?.content?.[0]?.text;
  return (typeof text === 'string' ? JSON.parse(text) : result) as T;
}

export default function AssigneeDemoPanel() {
  const app = usePrivosApp();
  const { roomId, userId, effectiveScopes } = usePrivosContext();
  const canWrite = effectiveScopes?.includes('lists:write') === true;

  const [listName, setListName] = useState('Isolated ASSIGNEE demo');
  const [itemName, setItemName] = useState('Sample assigned record');
  const [userIdsRaw, setUserIdsRaw] = useState(userId || '');
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<StepLog[]>([]);
  const [result, setResult] = useState<{ sent: string[]; readBack: string[]; matched: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    return parseToolResult<T>(await app.callServerTool({ name, arguments: args }));
  }

  async function runDemo() {
    if (!roomId) { setError('No roomId in context yet — reopen the app inside a Room.'); return; }
    const userIds = parseUserIdList(userIdsRaw);
    if (userIds.length < 2) { setError('Enter at least two user ids (comma or space separated) to demonstrate a multi-user assignment.'); return; }

    setRunning(true);
    setError(null);
    setResult(null);
    const nextLogs: StepLog[] = [];
    const log = (step: string, ok: boolean, detail: string, raw?: unknown) => { nextLogs.push({ step, ok, detail, raw }); setLogs([...nextLogs]); };

    try {
      // 1. Create the list as isolated. The Hub requires the caller to be the
      // room owner/admin for isolatedList: true.
      const created = await callTool<{ list: ListRef; defaultStage?: { _id: string } }>('mcpapp.lists.create', {
        name: listName,
        roomId,
        isolatedList: true,
      });
      const list = created.list;
      log('1. Create isolated list', true, `Created list "${list.name}" (${list._id}) with isolatedList: true.`, created);

      // 2. Add the ASSIGNEE field — the field type that actually controls
      // per-item visibility on an isolated list.
      const fieldResult = await callTool<{ field: FieldRef }>('mcpapp.lists.addField', {
        listId: list._id,
        name: ASSIGNEE_FIELD_NAME,
        type: 'ASSIGNEE',
      });
      const field = fieldResult.field;
      log('2. Add ASSIGNEE field', true, `Added field "${field.name}" (${field._id}), type ${field.type}.`, fieldResult);

      // 3. Create an item to assign.
      const stageId = created.defaultStage?._id ?? list.defaultStage?._id;
      // `createItem` names the row through `title`, not `name` — the Hub's own
      // tool schema, not a guess.
      const itemResult = await callTool<{ item: ItemRef }>('mcpapp.lists.createItem', {
        listId: list._id,
        title: itemName,
        ...(stageId ? { stageId } : {}),
      });
      const item = itemResult.item;
      log('3. Create item', true, `Created item "${item.name}" (${item._id}).`, itemResult);

      // 4. Assign SEVERAL users at once: the ASSIGNEE field takes an array of
      // bare user ids (also accepts a single bare id or { _id } objects).
      const sentIds = buildAssigneeValue(userIds);
      const updateResult = await callTool('mcpapp.lists.updateCustomField', {
        itemId: item._id,
        fieldId: field._id,
        value: sentIds,
      });
      log('4. Assign multiple users', true, `Assigned ${sentIds.length} user(s): ${sentIds.join(', ')}.`, updateResult);

      // 5. Read the item back and confirm the Hub stored — and will parse —
      // every assigned user id, not just the first one.
      const itemsResult = await callTool<{ items: ItemRef[] }>('mcpapp.lists.getItems', { listId: list._id });
      const readBackItem = itemsResult.items?.find((i) => i._id === item._id);
      const storedValue = readBackItem?.customFields?.find((cf) => cf.fieldId === field._id)?.value;
      const readBackIds = normalizeAssignedUserIds(storedValue);
      const matched = assignedIdsMatch(sentIds, readBackIds);
      log(
        '5. Read back and confirm',
        matched,
        matched
          ? `Confirmed: stored ASSIGNEE value resolves to the same ${readBackIds.length} user id(s) sent.`
          : `Mismatch — sent [${sentIds.join(', ')}] but read back [${readBackIds.join(', ')}].`,
        itemsResult,
      );
      setResult({ sent: sentIds, readBack: readBackIds, matched });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log('Failed', false, message);
      setError(message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="container">
      <h1>Isolated list: multi-user ASSIGNEE</h1>
      <p className="empty-text">
        Creates an isolated list, adds a field of type <code>ASSIGNEE</code>, creates an item, assigns
        several users to it in one call, then reads the item back to confirm every assigned user id was
        stored — not just the first one. Uses the already-approved <code>lists:write</code> permission;
        no new scope is requested.
      </p>

      {!canWrite && (
        <div className="items-count">
          This demo needs the optional <code>lists:write</code> permission, which is not granted.
        </div>
      )}

      <div className="form-group">
        <label htmlFor="assignee-list-name">List name</label>
        <input id="assignee-list-name" type="text" value={listName} onChange={(e) => setListName(e.target.value)} disabled={running} />
      </div>

      <div className="form-group">
        <label htmlFor="assignee-item-name">Item name</label>
        <input id="assignee-item-name" type="text" value={itemName} onChange={(e) => setItemName(e.target.value)} disabled={running} />
      </div>

      <div className="form-group">
        <label htmlFor="assignee-user-ids">User ids to assign (comma or space separated, at least two)</label>
        <input
          id="assignee-user-ids"
          type="text"
          value={userIdsRaw}
          onChange={(e) => setUserIdsRaw(e.target.value)}
          placeholder="userId1, userId2"
          disabled={running}
        />
        <p className="loading-text" style={{ margin: '4px 0' }}>
          Pre-filled with the current user id ({userId || 'unknown'}). Add a second account's user id —
          visible on that account's <em>Identity</em> tab in this same app — to see a real multi-user
          assignment.
        </p>
      </div>

      {error && <div className="error-message" role="alert">{error}</div>}

      <div className="form-actions">
        <button type="button" className="btn-submit" onClick={runDemo} disabled={!canWrite || running || !roomId}>
          {running ? 'Running…' : 'Run demo'}
        </button>
      </div>

      {logs.length > 0 && (
        <ul className="file-list" aria-label="Demo steps" style={{ marginTop: 16 }}>
          {logs.map((entry, i) => (
            <li key={i} className="file-row">
              <span className="file-name">{entry.ok ? '✓' : '✗'} {entry.step}</span>
              <span className="file-size">{entry.detail}</span>
            </li>
          ))}
        </ul>
      )}

      {result && (
        <div className={result.matched ? 'items-count' : 'error-message'} role="status" style={{ marginTop: 12 }}>
          {result.matched
            ? `Confirmed: all ${result.sent.length} assigned user id(s) round-tripped through the ASSIGNEE field.`
            : 'The read-back assignee ids did not match what was sent — see step 5 above.'}
        </div>
      )}

      {logs.length > 0 && (
        <details className="chat-json-block" style={{ marginTop: 12 }}>
          <summary>Raw tool responses</summary>
          <pre className="chat-json-pre"><code>{JSON.stringify(logs.map((l) => ({ step: l.step, raw: l.raw })), null, 2)}</code></pre>
        </details>
      )}
    </div>
  );
}
