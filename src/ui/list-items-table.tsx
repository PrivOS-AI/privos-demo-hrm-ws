/**
 * Items table — displays all items with inline edit and delete.
 */
import { useState, useEffect, useCallback } from 'react';
import type { McpApp } from '@privos_ai/app-react';
import { restCall } from './privos-rest';

/** Items requested per window. Deliberately small so paging is visible in the demo. */
const PAGE_SIZE = 20;

/** Merge a freshly fetched window into the held items, keyed by `_id`. */
function mergeById(existing: ItemData[], incoming: ItemData[]): ItemData[] {
  const byId = new Map(existing.map((item) => [item._id, item]));
  incoming.forEach((item) => byId.set(item._id, item));
  return Array.from(byId.values());
}

/** Did this request fail because the installation lacks the scope it needs? */
function isScopeDenied(err: any): boolean {
  const message = String(err?.message ?? '').toLowerCase();
  return message.includes('scope') || message.includes('not allowed') || message.includes('forbidden') || err?.status === 403;
}

interface FieldDefinition {
  _id: string;
  name: string;
  type: string;
  options?: { _id: string; value: string }[];
}

interface ItemData {
  _id: string;
  name?: string;
  key?: string;
  customFields?: { fieldId: string; value: any }[];
}

interface ListItemsTableProps {
  app: McpApp;
  listId: string;
  fields: FieldDefinition[];
  refreshKey: number;
  readOnly?: boolean;
}

export default function ListItemsTable({ app, listId, fields, refreshKey, readOnly = false }: ListItemsTableProps) {
  const [items, setItems] = useState<ItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  /** True when the response came from the capped legacy route rather than a query. */
  const [capped, setCapped] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editFields, setEditFields] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  /**
   * Load one window.
   *
   * `items.query` needs the optional `lists:query` scope. Until an administrator
   * grants it the app keeps working through the older route, which answers with at
   * most 500 items — so the fallback says so rather than quietly showing a subset.
   */
  const loadWindow = useCallback(async (cursor?: string) => {
    const body = await restCall<{ items: ItemData[]; nextCursor: string | null }>(
      app, 'POST', 'items.query', {
        body: {
          listId,
          filter: search.trim() ? { text: search.trim() } : undefined,
          sort: { field: 'order', direction: 1 },
          count: PAGE_SIZE,
          cursor,
        },
      },
    );
    return { items: Array.isArray(body.items) ? body.items : [], nextCursor: body.nextCursor ?? null };
  }, [app, listId, search]);

  const fetchItems = useCallback(async () => {
    if (!listId) return;
    setLoading(true);
    setError(null);
    try {
      const page = await loadWindow();
      setItems(page.items);
      setNextCursor(page.nextCursor);
      setCapped(false);
      setLastSyncAt(new Date().toISOString());
    } catch (err: any) {
      // A missing grant is reported by the proxy as a refused request; anything else
      // is a real failure and is shown as one.
      if (isScopeDenied(err)) {
        try {
          const body = await restCall<{ items: ItemData[]; truncated?: boolean }>(
            app, 'GET', 'items.listByListId', { query: { listId } },
          );
          setItems(Array.isArray(body.items) ? body.items : []);
          setNextCursor(null);
          setCapped(Boolean(body.truncated));
        } catch (fallbackErr: any) {
          setError(fallbackErr?.message || 'Failed to load items');
        }
      } else {
        setError(err?.message || 'Failed to load items');
      }
    } finally {
      setLoading(false);
    }
  }, [app, listId, loadWindow]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await loadWindow(nextCursor);
      // Merge by _id: a window boundary can repeat an item when the list is reordered
      // between requests.
      setItems((prev) => mergeById(prev, page.items));
      setNextCursor(page.nextCursor);
    } catch (err: any) {
      setError(err?.message || 'Failed to load more items');
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, loadWindow]);

  /**
   * Incremental sync: ask only for what changed since the last successful load and
   * merge it in. This is the pattern an app should use to stay current without
   * re-reading a list it already holds.
   */
  const syncChanges = useCallback(async () => {
    if (!listId || !lastSyncAt) return;
    setSyncing(true);
    try {
      const body = await restCall<{ items: ItemData[] }>(
        app, 'POST', 'items.query', {
          body: {
            listId,
            filter: { updatedAt: { gte: lastSyncAt } },
            sort: { field: '_updatedAt', direction: -1 },
            count: PAGE_SIZE,
          },
        },
      );
      const changed = Array.isArray(body.items) ? body.items : [];
      if (changed.length > 0) {
        setItems((prev) => mergeById(prev, changed));
      }
      setLastSyncAt(new Date().toISOString());
    } catch (err: any) {
      setError(err?.message || 'Failed to sync changes');
    } finally {
      setSyncing(false);
    }
  }, [app, listId, lastSyncAt]);

  useEffect(() => { fetchItems(); }, [fetchItems, refreshKey]);

  function startEdit(item: ItemData) {
    setEditingId(item._id);
    setEditName(item.name || '');
    const vals: Record<string, any> = {};
    for (const cf of item.customFields || []) {
      vals[cf.fieldId] = cf.value;
    }
    setEditFields(vals);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName('');
    setEditFields({});
  }

  async function saveEdit(itemId: string) {
    setSaving(true);
    setError(null);
    try {
      const customFields = Object.entries(editFields)
        .map(([fieldId, value]) => ({ fieldId, value }));
      // POST items.update — hub field is `name` (not `title`).
      await restCall(app, 'POST', 'items.update', {
        body: { itemId, name: editName, customFields },
      });
      // Update local state
      setItems((prev) => prev.map((item) => {
        if (item._id !== itemId) return item;
        return { ...item, name: editName, customFields };
      }));
      cancelEdit();
    } catch (err: any) {
      setError(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(itemId: string) {
    setDeletingId(itemId);
    try {
      await restCall(app, 'POST', 'items.delete', { body: { itemId } });
      setItems((prev) => prev.filter((i) => i._id !== itemId));
      if (editingId === itemId) cancelEdit();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete');
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  function getFieldValue(item: ItemData, fieldId: string): string {
    const cf = item.customFields?.find((f) => f.fieldId === fieldId);
    if (!cf || cf.value === null || cf.value === undefined) return '—';
    if (typeof cf.value === 'boolean') return cf.value ? 'Yes' : 'No';
    // File refs are objects (or arrays of them) with a `name`; show the filename
    // rather than "[object Object]". Open the item in PrivOS to view/download.
    const fmt = (v: any) => (v && typeof v === 'object' ? v.name || v._id || JSON.stringify(v) : String(v));
    if (Array.isArray(cf.value)) return cf.value.map(fmt).join(', ');
    return fmt(cf.value);
  }

  if (loading) return <p className="loading-text">Loading items...</p>;
  if (error) return <p className="error-message">{error}</p>;

  const controls = (
    <div className="items-table-controls" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
      <input
        type="text"
        value={search}
        placeholder="Search items..."
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') fetchItems(); }}
        className="edit-input"
        style={{ flex: '1 1 180px' }}
      />
      <button className="btn-cancel-edit" onClick={() => fetchItems()}>Search</button>
      <button className="btn-cancel-edit" onClick={() => syncChanges()} disabled={syncing || !lastSyncAt}>
        {syncing ? 'Syncing...' : 'Sync changes'}
      </button>
      {capped && (
        <span className="file-size">Showing up to 500 items — grant “Query list items” to page through the whole list.</span>
      )}
    </div>
  );

  if (items.length === 0) {
    return (
      <div className="items-table-wrapper">
        {controls}
        <p className="empty-text">{search.trim() ? 'No items match that search.' : 'No items yet.'}</p>
      </div>
    );
  }

  return (
    <div className="items-table-wrapper">
      {controls}
      <table className="items-table">
        <thead>
          <tr>
            <th>Name</th>
            {fields.map((f) => <th key={f._id}>{f.name}</th>)}
            {!readOnly && <th style={{ width: 70 }}></th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            editingId === item._id ? (
              <tr key={item._id} className="editing-row">
                <td>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="edit-input"
                  />
                </td>
                {fields.map((f) => (
                  <td key={f._id}>
                    {renderEditCell(f, editFields[f._id] ?? '', (v) =>
                      setEditFields((prev) => ({ ...prev, [f._id]: v }))
                    )}
                  </td>
                ))}
                {!readOnly && <td className="action-cell">
                  <button className="btn-save" onClick={() => saveEdit(item._id)} disabled={saving}>
                    {saving ? '...' : 'ok'}
                  </button>
                  <button className="btn-cancel-edit" onClick={cancelEdit}>x</button>
                </td>}
              </tr>
            ) : (
              <tr key={item._id}>
                <td>{item.name || item.key || '—'}</td>
                {fields.map((f) => (
                  <td key={f._id}>{getFieldValue(item, f._id)}</td>
                ))}
                {!readOnly && <td className="action-cell">
                  <button className="btn-edit" onClick={() => startEdit(item)} title="Edit">&#9998;</button>
                  <button className="btn-delete" onClick={() => setConfirmDeleteId(item._id)} title="Delete">
                    &#128465;
                  </button>
                </td>}
              </tr>
            )
          ))}
        </tbody>
      </table>

      {nextCursor && (
        <button className="btn-cancel-edit" onClick={() => loadMore()} disabled={loadingMore} style={{ marginBlockStart: 8 }}>
          {loadingMore ? 'Loading...' : 'Load more'}
        </button>
      )}

      {/* No total is shown: the query API deliberately does not return one, because a
          count cannot apply the visibility rule an isolated list is subject to. */}
      <p className="items-count">{items.length} record{items.length !== 1 ? 's' : ''} loaded</p>

      {/* Delete confirmation modal */}
      {!readOnly && confirmDeleteId && (
        <div className="modal-overlay" onClick={() => setConfirmDeleteId(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <p className="modal-title">Delete Record</p>
            <p className="modal-text">Are you sure you want to delete this record? This action cannot be undone.</p>
            <div className="modal-actions">
              <button
                className="btn-confirm-delete-modal"
                onClick={() => handleDelete(confirmDeleteId)}
                disabled={deletingId === confirmDeleteId}
              >
                {deletingId === confirmDeleteId ? 'Deleting...' : 'Delete'}
              </button>
              <button className="btn-cancel-modal" onClick={() => setConfirmDeleteId(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Render inline edit cell based on field type */
function renderEditCell(field: FieldDefinition, value: any, onChange: (v: any) => void) {
  switch (field.type) {
    case 'CHECKBOX':
      return <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} style={{ width: 'auto' }} />;
    case 'SELECT':
      return (
        <select value={value || ''} onChange={(e) => onChange(e.target.value)} className="edit-input">
          <option value="">--</option>
          {field.options?.map((o) => <option key={o._id} value={o.value}>{o.value}</option>)}
        </select>
      );
    case 'NUMBER':
      return <input type="number" value={value} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')} className="edit-input" />;
    case 'DATE':
    case 'DEADLINE':
      return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="edit-input" />;
    default:
      return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="edit-input" />;
  }
}
