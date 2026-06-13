/**
 * File upload panel — upload a file into the room's file storage, list existing
 * files, and preview a file's content in a viewer below the list.
 *
 * Upload goes through the SDK's `app.uploadFile()` (host/file.upload bridge → hub
 * `file-management.files.upload`), gated by `files:write`. Listing uses the REST
 * passthrough `GET file-management.files.channel/<roomId>` (`files:read`); each
 * file carries a presigned `downloadUrl` used to render images/PDFs directly.
 * Text content is fetched via the same-origin content proxy.
 */
import { useState, useEffect, useCallback } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos/app-react';
import { restCall } from './privos-rest';

interface RoomFile {
  _id: string;
  name?: string;
  type?: string;
  file_type?: string;
  size?: number;
  file_size?: number;
  downloadUrl?: string;
}

type FileKind = 'image' | 'pdf' | 'text' | 'other';

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico'];
const TEXT_EXT = [
  'txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'log', 'xml', 'yaml', 'yml',
  'ini', 'conf', 'env', 'js', 'ts', 'jsx', 'tsx', 'html', 'htm', 'css', 'sh', 'py', 'sql',
];

function extOf(name?: string): string {
  if (!name) return '';
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

function fileKind(f: RoomFile): FileKind {
  const ext = extOf(f.name);
  const mime = (f.type || f.file_type || '').toLowerCase();
  if (mime.startsWith('image/') || IMAGE_EXT.includes(ext)) return 'image';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime.startsWith('text/') || mime.includes('json') || TEXT_EXT.includes(ext)) return 'text';
  return 'other';
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

  // Preview state
  const [viewing, setViewing] = useState<RoomFile | null>(null);
  const [viewText, setViewText] = useState<string | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);

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

  const openViewer = useCallback(async (f: RoomFile) => {
    setViewing(f);
    setViewText(null);
    setViewError(null);
    if (fileKind(f) !== 'text') return;
    // Fetch text content via the same-origin content proxy (avoids CORS on presigned URL).
    setViewLoading(true);
    try {
      const body = await restCall<any>(app, 'GET', `file-management.files/${f._id}/content/${encodeURIComponent(f.name || '')}`);
      const text =
        typeof body?.result === 'string' ? body.result : typeof body === 'string' ? body : JSON.stringify(body, null, 2);
      setViewText(text);
    } catch (err: any) {
      setViewError(err?.message || 'Failed to load file content.');
    } finally {
      setViewLoading(false);
    }
  }, [app]);

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
        <input type="file" onChange={(e) => setSelected(e.target.files?.[0] || null)} />
        <button type="button" className="btn-submit" onClick={handleUpload} disabled={!selected || uploading}>
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
            <li
              key={f._id}
              className={`file-row file-row-clickable${viewing?._id === f._id ? ' file-row-active' : ''}`}
              onClick={() => openViewer(f)}
            >
              <span className="file-name">{f.name || f._id}</span>
              {(() => {
                const size = f.size ?? f.file_size;
                return typeof size === 'number' ? <span className="file-size">{formatSize(size)}</span> : null;
              })()}
            </li>
          ))}
        </ul>
      )}

      {viewing && (
        <div className="file-viewer">
          <div className="file-viewer-head">
            <span className="file-name">{viewing.name || viewing._id}</span>
            <button type="button" className="btn-cancel-field" onClick={() => setViewing(null)}>Close</button>
          </div>
          <div className="file-viewer-body">{renderPreview(viewing, viewText, viewLoading, viewError)}</div>
        </div>
      )}
    </div>
  );
}

function renderPreview(f: RoomFile, text: string | null, loading: boolean, error: string | null) {
  const kind = fileKind(f);
  if (kind === 'image') {
    return f.downloadUrl ? (
      <img src={f.downloadUrl} alt={f.name || ''} className="file-viewer-image" />
    ) : (
      <p className="empty-text">No preview URL.</p>
    );
  }
  if (kind === 'pdf') {
    return f.downloadUrl ? (
      <iframe src={f.downloadUrl} title={f.name || 'PDF'} className="file-viewer-frame" />
    ) : (
      <p className="empty-text">No preview URL.</p>
    );
  }
  if (kind === 'text') {
    if (loading) return <p className="loading-text">Loading content...</p>;
    if (error) return <div className="error-message">{error}</div>;
    return <pre className="file-viewer-text">{text}</pre>;
  }
  return (
    <p className="empty-text">
      Preview not available for this file type.{' '}
      {f.downloadUrl && (
        <a href={f.downloadUrl} target="_blank" rel="noopener noreferrer">Open / Download</a>
      )}
    </p>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
