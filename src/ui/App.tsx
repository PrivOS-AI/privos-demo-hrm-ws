import { useState } from 'react';
import { PrivosAppProvider, usePrivosContext } from '@privos/app-react';
import { ThemeProvider, ThemeToggle } from './theme-provider';
import HRManagementDashboard from './contact-collector-form';
import FileUploadPanel from './file-upload-panel';
import AiChatPanel from './ai-chat-panel';
import AiPoemPanel from './ai-poem-panel';
import AiHistoryPanel from './ai-history-panel';
import SkillsPanel from './skills-panel';
import SandboxConnectPanel from './sandbox-connect-panel';
import WhoamiPanel from './whoami-panel';
import InfoPanel from './info-panel';

type Tab = 'identity' | 'info' | 'records' | 'files' | 'chat' | 'poem' | 'history' | 'skills' | 'sandbox';

const TABS: { id: Tab; label: string }[] = [
  { id: 'identity', label: 'Identity' },
  { id: 'info', label: 'Info' },
  { id: 'records', label: 'Records' },
  { id: 'files', label: 'Files' },
  { id: 'chat', label: 'AI Chat' },
  { id: 'poem', label: 'AI Poem' },
  { id: 'history', label: 'AI History' },
  { id: 'skills', label: 'Skills' },
  { id: 'sandbox', label: 'Sandbox' },
];

function ThemedApp() {
  const { theme } = usePrivosContext();
  const [tab, setTab] = useState<Tab>('identity');

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

      {tab === 'identity' && <WhoamiPanel />}
      {tab === 'info' && <InfoPanel />}
      {tab === 'records' && <HRManagementDashboard />}
      {tab === 'files' && <FileUploadPanel />}
      {tab === 'chat' && <AiChatPanel />}
      {tab === 'poem' && <AiPoemPanel />}
      {tab === 'history' && <AiHistoryPanel />}
      {tab === 'skills' && <SkillsPanel />}
      {tab === 'sandbox' && <SandboxConnectPanel />}
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
