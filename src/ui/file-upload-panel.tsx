/**
 * File upload panel — upload a file into the room's file storage and list existing files.
 *
 * Upload goes through the SDK's `app.uploadFile()` (host/file.upload bridge → hub
 * `file-management.files.upload`), gated by the `files:write` scope. Listing uses the
 * REST passthrough `GET file-management.files.channel/<roomId>`, gated by `files:read`.
 * Both run as the current user.
 */
import { useState, useEffect, useCallback } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos/app-react';
import { restCall } from './privos-rest';

interface RoomFile {
  _id: string;
  name?: string;
  type?: string;
  size?: number;
}

/** Read a File into a base64 data URI for the upload bridge. */
function readAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export default function FileUploadPanel() {
  const app = usePrivosApp();
  const { roomId } = usePrivosContext();

  const [files, setFiles] = useState<RoomFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<File | null>(null);

  const loadFiles = useCallback(async () => {
    if (!roomId) return;
    setLoading(true);
    setError(null);
    try {
      // Response shape varies by hub version — accept {files}, {data} or a bare array.
      const body = await restCall<any>(app, 'GET', `file-management.files.channel/${roomId}`);
      const list = body?.files ?? body?.data ?? (Array.isArray(body) ? body : []);
      setFiles(Array.isArray(list) ? list : []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load files.');
    } finally {
      setLoading(false);
    }
  }, [app, roomId]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  async function handleUpload() {
    if (!selected || !roomId) return;
    setUploading(true);
    setError(null);
    try {
      const dataUri = await readAsDataUri(selected);
      await app.uploadFile({
        channelId: roomId,
        fileName: selected.name,
        base64Data: dataUri,
        mimeType: selected.type || 'application/octet-stream',
      });
      setSelected(null);
      await loadFiles();
    } catch (err: any) {
      setError(err?.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="container">
      <h1>Files</h1>

      <div className="upload-row">
        <input
          type="file"
          onChange={(e) => setSelected(e.target.files?.[0] || null)}
        />
        <button
          type="button"
          className="btn-submit"
          onClick={handleUpload}
          disabled={!selected || uploading}
        >
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <p className="loading-text">Loading files...</p>
      ) : files.length === 0 ? (
        <p className="empty-text">No files in this room yet.</p>
      ) : (
        <ul className="file-list">
          {files.map((f) => (
            <li key={f._id} className="file-row">
              <span className="file-name">{f.name || f._id}</span>
              {typeof f.size === 'number' && <span className="file-size">{formatSize(f.size)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
