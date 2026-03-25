/**
 * Demo HR Management — select a list, view items, add new records with custom fields.
 * Dynamically renders fields based on the selected list's fieldDefinitions.
 */
import { useState, useEffect, useCallback } from 'react';
import { usePrivosApp, usePrivosContext, useLists } from '@privos/app-react';
import ListItemsTable from './list-items-table';

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

const FIELD_TYPES = [
  { value: 'TEXT', label: 'Text' },
  { value: 'TEXTAREA', label: 'Text Area' },
  { value: 'NUMBER', label: 'Number' },
  { value: 'DATE', label: 'Date' },
  { value: 'CHECKBOX', label: 'Checkbox' },
  { value: 'URL', label: 'URL' },
  { value: 'SELECT', label: 'Dropdown' },
];

export default function HRManagementDashboard() {
  const app = usePrivosApp();
  const { roomId } = usePrivosContext();
  const { data: lists, loading: listsLoading, error: listsError } = useLists(roomId);

  const [selectedListId, setSelectedListId] = useState('');
  const [selectedList, setSelectedList] = useState<ListData | null>(null);
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

  const fetchListDetails = useCallback(async (listId: string) => {
    if (!listId) {
      setSelectedList(null);
      setFieldValues({});
      return;
    }
    setLoadingList(true);
    try {
      const result = await app.callServerTool({
        name: 'privos.lists.get',
        arguments: { listId },
      });
      const parsed = typeof result?.content?.[0]?.text === 'string'
        ? JSON.parse(result.content[0].text)
        : result;
      setSelectedList(parsed);
      setFieldValues({});
    } catch {
      setSelectedList(null);
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

  async function handleAddField() {
    if (!newFieldName.trim() || !selectedListId) return;
    setAddingField(true);
    setError(null);
    try {
      const result = await app.callServerTool({
        name: 'privos.lists.addField',
        arguments: { listId: selectedListId, name: newFieldName.trim(), type: newFieldType },
      });
      const newField = typeof result?.content?.[0]?.text === 'string'
        ? JSON.parse(result.content[0].text) : result;
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

    const customFields = Object.entries(fieldValues)
      .filter(([, v]) => v !== '' && v !== null && v !== undefined)
      .map(([fieldId, value]) => ({ fieldId, value }));

    setSubmitting(true);
    try {
      await app.callServerTool({
        name: 'privos.lists.createItem',
        arguments: { listId: selectedListId, title: itemName, customFields },
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

      {/* List selector */}
      <div className="form-group">
        <label htmlFor="list-select">Select List</label>
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
