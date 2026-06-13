import { useState } from 'react';
import { PrivosAppProvider, usePrivosContext } from '@privos/app-react';
import { ThemeProvider, ThemeToggle } from './theme-provider';
import HRManagementDashboard from './contact-collector-form';
import FileUploadPanel from './file-upload-panel';
import AiChatPanel from './ai-chat-panel';

type Tab = 'records' | 'files' | 'chat';

const TABS: { id: Tab; label: string }[] = [
  { id: 'records', label: 'Records' },
  { id: 'files', label: 'Files' },
  { id: 'chat', label: 'AI Chat' },
];

function ThemedApp() {
  const { theme } = usePrivosContext();
  const [tab, setTab] = useState<Tab>('records');

  return (
    <ThemeProvider hostTheme={theme}>
      <div className="app-header">
        <nav className="app-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tab-btn${tab === t.id ? ' tab-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <ThemeToggle />
      </div>

      {tab === 'records' && <HRManagementDashboard />}
      {tab === 'files' && <FileUploadPanel />}
      {tab === 'chat' && <AiChatPanel />}
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <PrivosAppProvider>
      <ThemedApp />
    </PrivosAppProvider>
  );
}
