/**
 * Items table — displays all items with inline edit and delete.
 */
import { useState, useEffect, useCallback } from 'react';
import type { McpApp } from '@privos/app-react';

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
}

export default function ListItemsTable({ app, listId, fields, refreshKey }: ListItemsTableProps) {
  const [items, setItems] = useState<ItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editFields, setEditFields] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!listId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await app.callServerTool({
        name: 'privos.lists.getItems',
        arguments: { listId },
      });
      const parsed = typeof result?.content?.[0]?.text === 'string'
        ? JSON.parse(result.content[0].text) : result;
      setItems(Array.isArray(parsed) ? parsed : []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load items');
    } finally {
      setLoading(false);
    }
  }, [app, listId]);

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
      await app.callServerTool({
        name: 'privos.lists.updateItem',
        arguments: { itemId, title: editName, customFields },
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
      await app.callServerTool({
        name: 'privos.lists.deleteItem',
        arguments: { itemId },
      });
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
    if (Array.isArray(cf.value)) return cf.value.join(', ');
    return String(cf.value);
  }

  if (loading) return <p className="loading-text">Loading items...</p>;
  if (error) return <p className="error-message">{error}</p>;
  if (items.length === 0) return <p className="empty-text">No items yet.</p>;

  return (
    <div className="items-table-wrapper">
      <table className="items-table">
        <thead>
          <tr>
            <th>Name</th>
            {fields.map((f) => <th key={f._id}>{f.name}</th>)}
            <th style={{ width: 70 }}></th>
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
                <td className="action-cell">
                  <button className="btn-save" onClick={() => saveEdit(item._id)} disabled={saving}>
                    {saving ? '...' : 'ok'}
                  </button>
                  <button className="btn-cancel-edit" onClick={cancelEdit}>x</button>
                </td>
              </tr>
            ) : (
              <tr key={item._id}>
                <td>{item.name || item.key || '—'}</td>
                {fields.map((f) => (
                  <td key={f._id}>{getFieldValue(item, f._id)}</td>
                ))}
                <td className="action-cell">
                  <button className="btn-edit" onClick={() => startEdit(item)} title="Edit">&#9998;</button>
                  <button className="btn-delete" onClick={() => setConfirmDeleteId(item._id)} title="Delete">
                    &#128465;
                  </button>
                </td>
              </tr>
            )
          ))}
        </tbody>
      </table>
      <p className="items-count">{items.length} record{items.length !== 1 ? 's' : ''}</p>

      {/* Delete confirmation modal */}
      {confirmDeleteId && (
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
