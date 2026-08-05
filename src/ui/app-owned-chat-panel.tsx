/**
 * Reference example: an app that renders its **own** AI chat window instead of the hub's.
 *
 * `useAppChatSurface` claims the hub's floating launcher for this iframe mount. From then on a
 * click on that launcher arrives here as `onOpen` and the hub hides its icon; calling `close()`
 * from the panel's minimize button hands the launcher back.
 *
 * The chat body is the same `AiChatPanel` used by the "AI Chat" tab — the AI path is unchanged,
 * only the surface that presents it. Publishers should treat this as the smallest working
 * shape, not as a finished design.
 */
import { useState } from 'react';
import { useAppChatSurface } from '@privos/app-react';
import AiChatPanel from './ai-chat-panel';

export default function AppOwnedChatPanel() {
  const [visible, setVisible] = useState(false);
  const { resolved, supported, open, close } = useAppChatSurface({
    onOpen: () => setVisible(true),
    onClose: () => setVisible(false),
  });

  // No hub launcher to delegate here (standalone page / sidebar panel): draw our own way in.
  // Wait for `resolved` first — drawing this before the host answers would put a second
  // launcher on screen next to the hub's own on every mount.
  const showOwnLauncher = resolved && !supported && !visible;

  return (
    <>
      {showOwnLauncher && (
        <button
          type="button"
          className="tab-btn"
          style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 40 }}
          onClick={() => {
            setVisible(true);
            open();
          }}
        >
          Ask AI
        </button>
      )}

      {visible && (
        <aside
          aria-label="App AI assistant"
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: 'min(420px, 100vw)',
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--app-surface, #fff)',
            borderLeft: '1px solid var(--app-border, rgba(0,0,0,0.12))',
            boxShadow: '-8px 0 24px rgba(0,0,0,0.12)',
          }}
        >
          <header
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '10px 12px',
              borderBottom: '1px solid var(--app-border, rgba(0,0,0,0.12))',
            }}
          >
            <strong>HR Assistant</strong>
            <button
              type="button"
              className="tab-btn"
              aria-label="Minimize chat"
              onClick={() => {
                setVisible(false);
                // Tell the hub we are done so its launcher comes back.
                close();
              }}
            >
              Minimize
            </button>
          </header>

          <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <AiChatPanel />
          </div>
        </aside>
      )}
    </>
  );
}
