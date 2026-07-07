/**
 * Info panel — displays the basic room/app identifiers the hub exposes under the
 * `basic:information` scope: room ID, room slug, this app's ID, and the deep-link
 * URL to this app inside the room.
 *
 * These arrive via `usePrivosContext()`, which merges the `mcpapp.context.get`
 * tool response (roomId, roomSlug, appId, appUrl) into the context object.
 */
import { useState } from 'react';
import { usePrivosContext } from '@privos/app-react';

export default function InfoPanel() {
  // roomSlug/appId/appUrl are supplied by mcpapp.context.get (basic:information scope);
  // they aren't in the base PrivosContext type, so read them off the merged object.
  const ctx = usePrivosContext() as Record<string, any>;
  const roomId: string = ctx.roomId || '';
  const roomSlug: string = ctx.roomSlug || ctx.roomName || '';
  const appId: string = ctx.appId || '';
  const appUrl: string = ctx.appUrl || '';

  const rows: { label: string; value: string; mono?: boolean }[] = [
    { label: 'Room ID', value: roomId, mono: true },
    { label: 'Room slug', value: roomSlug, mono: true },
    { label: 'App ID', value: appId, mono: true },
  ];

  return (
    <div style={{ padding: 20, maxWidth: 680 }}>
      <h2 style={{ marginTop: 0 }}>App &amp; room info</h2>
      <p style={{ opacity: 0.75, marginTop: -6 }}>
        Basic identifiers exposed by the host under the <code>basic:information</code> scope.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '10px 16px', alignItems: 'center' }}>
        {rows.map((r) => (
          <Row key={r.label} label={r.label} value={r.value} mono={r.mono} />
        ))}
      </div>

      <h3 style={{ marginBottom: 6 }}>App URL</h3>
      {appUrl ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <a href={appUrl} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>
            {appUrl}
          </a>
          <CopyButton text={appUrl} />
        </div>
      ) : (
        <div style={{ opacity: 0.6 }}>Not available (open the app inside a room).</div>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <div style={{ opacity: 0.7 }}>{label}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-all' }}>{value || '—'}</span>
        {value ? <CopyButton text={value} /> : null}
      </div>
    </>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          },
          () => {},
        );
      }}
      style={{ padding: '2px 8px', fontSize: 12, cursor: 'pointer' }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
