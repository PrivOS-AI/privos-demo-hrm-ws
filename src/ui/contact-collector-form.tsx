/**
 * Demo HR Management — select a list, view items, add new records with custom fields.
 * Dynamically renders fields based on the selected list's fieldDefinitions.
 */
import { useState, useEffect, useCallback } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos/app-react';
import ListItemsTable from './list-items-table';
import { restCall } from './privos-rest';

interface FieldDefinition {
  _id: string;
  name: string;
  type: string;
  options?: { _id: string; value: string }[];
}

interface ListData {
  _id: string;
  name: string;
  fieldDefinitions?: FieldDefinition[];
}

interface StageData {
  _id: string;
  name?: string;
}

const FIELD_TYPES = [
  { value: 'TEXT', label: 'Text' },
  { value: 'TEXTAREA', label: 'Text Area' },
  { value: 'NUMBER', label: 'Number' },
  { value: 'DATE', label: 'Date' },
  { value: 'CHECKBOX', label: 'Checkbox' },
  { value: 'URL', label: 'URL' },
  { value: 'SELECT', label: 'Dropdown' },
  { value: 'FILE', label: 'File' },
];

// Sample custom fields seeded into every new list. The item's built-in `name`
// covers "name", so these are the extra columns (phone/email/document/file).
const SAMPLE_LIST_FIELDS = [
  { name: 'Phone', type: 'TEXT' },
  { name: 'Email', type: 'TEXT' },
  { name: 'Document', type: 'DOCUMENT' },
  { name: 'File', type: 'FILE' },
];

/** Read a File into a base64 data URI for the upload bridge. */
function readAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export default function HRManagementDashboard() {
  const app = usePrivosApp();
  const { roomId } = usePrivosContext();

  // Lists in the room — fetched via the hub REST API (GET lists.listByRoomId),
  // gated by the app's `lists:read` scope. Runs as the current user.
  const [lists, setLists] = useState<ListData[]>([]);
  const [listsLoading, setListsLoading] = useState(true);
  const [listsError, setListsError] = useState<Error | null>(null);

  const [selectedListId, setSelectedListId] = useState('');
  const [selectedList, setSelectedList] = useState<ListData | null>(null);
  const [stages, setStages] = useState<StageData[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [itemName, setItemName] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Add field state
  const [showAddField, setShowAddField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState('TEXT');
  const [addingField, setAddingField] = useState(false);

  // Show/hide the add form
  const [showForm, setShowForm] = useState(false);

  // Create-list state
  const [showCreateList, setShowCreateList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [creatingList, setCreatingList] = useState(false);
  const [createListError, setCreateListError] = useState<string | null>(null);

  // Load lists for the room once we know the roomId.
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    setListsLoading(true);
    setListsError(null);
    restCall<{ lists: ListData[] }>(app, 'GET', 'lists.listByRoomId', { query: { roomId } })
      .then((body) => { if (!cancelled) setLists(Array.isArray(body.lists) ? body.lists : []); })
      .catch((err) => { if (!cancelled) setListsError(err instanceof Error ? err : new Error(String(err))); })
      .finally(() => { if (!cancelled) setListsLoading(false); });
    return () => { cancelled = true; };
  }, [app, roomId]);

  const fetchListDetails = useCallback(async (listId: string) => {
    if (!listId) {
      setSelectedList(null);
      setStages([]);
      setFieldValues({});
      return;
    }
    setLoadingList(true);
    try {
      // GET lists.info returns { list, stages, itemCount }. The list carries its
      // fieldDefinitions; stages are needed because items.create requires a stageId.
      const body = await restCall<{ list: ListData; stages: StageData[] }>(
        app, 'GET', 'lists.info', { query: { listId } },
      );
      setSelectedList(body.list);
      setStages(Array.isArray(body.stages) ? body.stages : []);
      setFieldValues({});
    } catch {
      setSelectedList(null);
      setStages([]);
    } finally {
      setLoadingList(false);
    }
  }, [app]);

  useEffect(() => {
    fetchListDetails(selectedListId);
    setShowForm(false);
    setSuccess(false);
  }, [selectedListId, fetchListDetails]);

  function setFieldValue(fieldId: string, value: any) {
    setFieldValues((prev) => ({ ...prev, [fieldId]: value }));
  }

  async function handleCreateList() {
    const name = newListName.trim();
    if (!name || !roomId) return;
    setCreatingList(true);
    setCreateListError(null);
    try {
      // POST lists.create seeds the list with the sample fields in one call and
      // returns { list, defaultStage }. Needs lists:write + room owner/admin.
      const body = await restCall<{ list: ListData }>(
        app, 'POST', 'lists.create',
        { body: { name, roomId, fieldDefinitions: SAMPLE_LIST_FIELDS } },
      );
      const created = body.list;
      setLists((prev) => [...prev, created]);
      setSelectedListId(created._id);
      setShowCreateList(false);
      setNewListName('');
    } catch (err: any) {
      setCreateListError(err?.message || 'Failed to create list.');
    } finally {
      setCreatingList(false);
    }
  }

  async function handleAddField() {
    if (!newFieldName.trim() || !selectedListId) return;
    setAddingField(true);
    setError(null);
    try {
      // POST lists.fields.create returns { list, field }.
      const body = await restCall<{ field: FieldDefinition }>(
        app, 'POST', 'lists.fields.create',
        { body: { listId: selectedListId, name: newFieldName.trim(), type: newFieldType } },
      );
      const newField = body.field;
      setSelectedList((prev) => prev ? {
        ...prev,
        fieldDefinitions: [...(prev.fieldDefinitions || []), newField],
      } : prev);
      setNewFieldName('');
      setNewFieldType('TEXT');
      setShowAddField(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to add field.');
    } finally {
      setAddingField(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!itemName.trim()) { setError('Name is required.'); return; }
    if (!selectedListId) { setError('Please select a list.'); return; }

    // items.create requires a stageId — default to the list's first stage.
    const stageId = stages[0]?._id;
    if (!stageId) { setError('This list has no stages to add records to.'); return; }

    setSubmitting(true);
    try {
      // Build custom fields. FILE fields hold a selected File — upload it to the room
      // first (files:write), then store the hub's canonical FILE value: an array of
      // { _id, name } file refs (the UI resolves the download URL from _id).
      const entries = Object.entries(fieldValues).filter(([, v]) => v !== '' && v !== null && v !== undefined);
      const customFields: { fieldId: string; value: any }[] = [];
      for (const [fieldId, value] of entries) {
        if (value instanceof File) {
          const up = await app.uploadFile({
            channelId: roomId,
            fileName: value.name,
            base64Data: await readAsDataUri(value),
            mimeType: value.type || 'application/octet-stream',
          });
          const fid = up?.file?._id;
          if (!fid) throw new Error('Upload did not return a file id.');
          const mimeType = value.type || up?.file?.file_type || 'application/octet-stream';
          // Single-file refs carry _id + display metadata; the hub viewer resolves
          // the download by _id. A SINGLE `FILE` field stores one object; the
          // multi/document fields store an array (matching the hub's own shape).
          const ref = {
            _id: fid,
            name: up?.file?.name || value.name,
            type: mimeType,
            size: value.size,
            file_type: mimeType,
            file_size: value.size,
          };
          const fieldDef = (selectedList?.fieldDefinitions || []).find((f) => f._id === fieldId);
          const isMulti = fieldDef?.type === 'FILE_MULTIPLE' || fieldDef?.type === 'DOCUMENT';
          customFields.push({ fieldId, value: isMulti ? [ref] : ref });
        } else {
          customFields.push({ fieldId, value });
        }
      }

      // POST items.create — note the hub field is `name` (not `title`).
      await restCall(app, 'POST', 'items.create', {
        body: { listId: selectedListId, name: itemName, stageId, customFields },
      });
      setSuccess(true);
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setItemName('');
    setFieldValues({});
    setSuccess(false);
    setError(null);
  }

  if (listsLoading) {
    return <div className="container"><p>Loading lists...</p></div>;
  }
  if (listsError) {
    return <div className="container"><p className="error-message">Failed to load lists: {listsError.message}</p></div>;
  }

  const availableLists: ListData[] = Array.isArray(lists) ? lists : [];
  const fields = selectedList?.fieldDefinitions || [];

  return (
    <div className="container">
      <h1>Demo HR Management</h1>

      {/* List selector + create */}
      <div className="form-group">
        <label htmlFor="list-select">Select List</label>
        <div className="list-select-row">
          <select
            id="list-select"
            value={selectedListId}
            onChange={(e) => setSelectedListId(e.target.value)}
          >
            <option value="">-- Select a list --</option>
            {availableLists.map((list) => (
              <option key={list._id} value={list._id}>{list.name}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn-new-list"
            onClick={() => { setShowCreateList((v) => !v); setCreateListError(null); }}
          >
            + New List
          </button>
        </div>

        {showCreateList && (
          <div className="add-field-panel">
            <div className="add-field-row">
              <input
                type="text"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="New list name"
                className="add-field-name"
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateList(); }}
              />
            </div>
            <p className="loading-text" style={{ margin: '4px 0' }}>
              Seeds fields: Name, Phone, Email, Document, File
            </p>
            {createListError && <div className="error-message">{createListError}</div>}
            <div className="add-field-actions">
              <button type="button" className="btn-confirm-field"
                onClick={handleCreateList} disabled={creatingList || !newListName.trim()}>
                {creatingList ? 'Creating...' : 'Create'}
              </button>
              <button type="button" className="btn-cancel-field"
                onClick={() => { setShowCreateList(false); setNewListName(''); setCreateListError(null); }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {loadingList && <p className="loading-text">Loading...</p>}

      {/* Items table */}
      {selectedList && !loadingList && (
        <>
          <ListItemsTable
            app={app}
            listId={selectedListId}
            fields={fields}
            refreshKey={refreshKey}
          />

          {/* Add record toggle */}
          {!showForm && !success && (
            <button type="button" className="btn-submit" onClick={() => setShowForm(true)}>
              + Add Record
            </button>
          )}

          {/* Success message */}
          {success && (
            <div className="success-message">
              <p>Record added successfully!</p>
              <button className="btn-reset" onClick={() => { handleReset(); setShowForm(true); }}>
                Add Another
              </button>
              <button className="btn-cancel-field" onClick={() => { handleReset(); setShowForm(false); }}
                style={{ marginLeft: 8 }}>
                Done
              </button>
            </div>
          )}

          {/* Add record form */}
          {showForm && !success && (
            <form onSubmit={handleSubmit} className="add-record-form">
              <h2>Add Record</h2>
              {error && <div className="error-message">{error}</div>}

              <div className="form-group">
                <label htmlFor="item-name">Name *</label>
                <input
                  id="item-name"
                  type="text"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="Record name"
                  required
                />
              </div>

              {fields.map((field) => (
                <div className="form-group" key={field._id}>
                  <label htmlFor={`field-${field._id}`}>{field.name}</label>
                  {renderFieldInput(field, fieldValues[field._id] ?? '', (v) => setFieldValue(field._id, v))}
                </div>
              ))}

              {/* Add field section */}
              {!showAddField ? (
                <button type="button" className="btn-add-field" onClick={() => setShowAddField(true)}>
                  + Add Field
                </button>
              ) : (
                <div className="add-field-panel">
                  <div className="add-field-row">
                    <input
                      type="text"
                      value={newFieldName}
                      onChange={(e) => setNewFieldName(e.target.value)}
                      placeholder="Field name"
                      className="add-field-name"
                    />
                    <select
                      value={newFieldType}
                      onChange={(e) => setNewFieldType(e.target.value)}
                      className="add-field-type"
                    >
                      {FIELD_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="add-field-actions">
                    <button type="button" className="btn-confirm-field"
                      onClick={handleAddField} disabled={addingField || !newFieldName.trim()}>
                      {addingField ? 'Adding...' : 'Add'}
                    </button>
                    <button type="button" className="btn-cancel-field"
                      onClick={() => { setShowAddField(false); setNewFieldName(''); }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="form-actions">
                <button type="submit" className="btn-submit" disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Save Record'}
                </button>
                <button type="button" className="btn-cancel-field"
                  onClick={() => { setShowForm(false); handleReset(); }}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}

/** Render the appropriate input based on field type */
function renderFieldInput(
  field: FieldDefinition,
  value: any,
  onChange: (v: any) => void,
) {
  const id = `field-${field._id}`;

  switch (field.type) {
    case 'TEXTAREA':
      return <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.name} rows={3} />;
    case 'NUMBER':
      return <input id={id} type="number" value={value} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')} placeholder={field.name} />;
    case 'DATE':
    case 'DEADLINE':
      return <input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} />;
    case 'DATE_TIME':
      return <input id={id} type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} />;
    case 'CHECKBOX':
      return <input id={id} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} style={{ width: 'auto' }} />;
    case 'URL':
      return <input id={id} type="url" value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://..." />;
    case 'FILE':
    case 'FILE_MULTIPLE':
    case 'DOCUMENT':
      // Store the File object; the form uploads it on submit and saves a { _id, name } ref.
      return (
        <div>
          <input id={id} type="file" onChange={(e) => onChange(e.target.files?.[0] || null)} />
          {value instanceof File && <span className="file-size" style={{ marginInlineStart: 8 }}>{value.name}</span>}
        </div>
      );
    case 'SELECT':
      return (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">-- Select --</option>
          {field.options?.map((opt) => <option key={opt._id} value={opt.value}>{opt.value}</option>)}
        </select>
      );
    case 'MULTI_SELECT':
      return (
        <select id={id} multiple value={Array.isArray(value) ? value : []}
          onChange={(e) => onChange(Array.from(e.target.selectedOptions, (o) => o.value))}>
          {field.options?.map((opt) => <option key={opt._id} value={opt.value}>{opt.value}</option>)}
        </select>
      );
    default:
      return <input id={id} type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.name} />;
  }
}
