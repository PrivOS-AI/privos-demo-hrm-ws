import { useState } from 'react';
import { PrivosAppProvider, usePrivosContext } from '@privos_ai/app-react';
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
import LicensePanel from './license-panel';
import AppOwnedChatPanel from './app-owned-chat-panel';
import AgentBotPanel from './agent-bot-panel';
import EmbedsPanel from './embeds-panel';
import BotWorkloadPanel from './bot-workload-panel';

type Tab =
  | 'identity'
  | 'info'
  | 'records'
  | 'license'
  | 'files'
  | 'chat'
  | 'poem'
  | 'history'
  | 'skills'
  | 'sandbox'
  | 'agent'
  | 'embeds'
  | 'workload';

const TABS: { id: Tab; label: string; scope?: string; degradedBehavior?: string }[] = [
  { id: 'identity', label: 'Identity' },
  { id: 'info', label: 'Info', scope: 'basic:information', degradedBehavior: 'Installation context is unavailable.' },
  { id: 'records', label: 'Records', scope: 'lists:read', degradedBehavior: 'HR records cannot be displayed.' },
  { id: 'license', label: 'License' },
  { id: 'files', label: 'Files', scope: 'files:read', degradedBehavior: 'Document previews and the room file list are hidden.' },
  { id: 'chat', label: 'AI Chat', scope: 'sandbox:ai-chat:write', degradedBehavior: 'AI chat creation is disabled.' },
  { id: 'poem', label: 'AI Poem', scope: 'sandbox:ai-chat:write', degradedBehavior: 'AI poem generation is disabled.' },
  { id: 'history', label: 'AI History', scope: 'sandbox:ai-chat', degradedBehavior: 'Existing AI chat sessions are not displayed.' },
  { id: 'skills', label: 'Skills', scope: 'sandbox:skills:use', degradedBehavior: 'Sandbox skill controls are hidden.' },
  { id: 'sandbox', label: 'Sandbox', scope: 'sandbox:botkey:push', degradedBehavior: 'Sandbox connection controls are unavailable.' },
  { id: 'agent', label: 'Agent bot' },
  // No scope: embedding is governed by the admin's per-app origin allowlist, not a grant.
  { id: 'embeds', label: 'Embeds' },
  // No single scope: the panel itself shows granted/not-granted per lifecycle scope.
  { id: 'workload', label: 'Bot workload' },
];

function FeatureUnavailable({ text }: { text: string }) {
  return (
    <div className="container">
      <h1>Optional feature unavailable</h1>
      <div className="error-message">{text} An administrator can enable the optional permission in app settings.</div>
    </div>
  );
}

function ThemedApp() {
  const { theme, effectiveScopes } = usePrivosContext();
  const [tab, setTab] = useState<Tab>('identity');
  const activeDefinition = TABS.find(({ id }) => id === tab)!;
  const capabilityResolved = Array.isArray(effectiveScopes);
  const activeGranted = !activeDefinition.scope || effectiveScopes?.includes(activeDefinition.scope) === true;

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
              aria-label={t.scope && capabilityResolved && !effectiveScopes.includes(t.scope) ? `${t.label} — optional permission not granted` : t.label}
              title={t.scope && capabilityResolved && !effectiveScopes.includes(t.scope) ? 'Optional permission not granted' : undefined}
            >
              {t.label}{t.scope && capabilityResolved && !effectiveScopes.includes(t.scope) ? ' · Off' : ''}
            </button>
          ))}
        </nav>
        <ThemeToggle />
      </div>

      {!capabilityResolved && activeDefinition.scope && <div className="container"><p className="loading-text">Checking granted access…</p></div>}
      {capabilityResolved && !activeGranted && activeDefinition.scope && (
        <FeatureUnavailable text={activeDefinition.degradedBehavior || 'This feature is disabled.'} />
      )}
      {(!activeDefinition.scope || (capabilityResolved && activeGranted)) && (
        <>
          {tab === 'identity' && <WhoamiPanel />}
          {tab === 'info' && <InfoPanel />}
          {tab === 'records' && <HRManagementDashboard />}
          {tab === 'license' && <LicensePanel />}
          {tab === 'files' && <FileUploadPanel />}
          {tab === 'chat' && <AiChatPanel />}
          {tab === 'poem' && <AiPoemPanel />}
          {tab === 'history' && <AiHistoryPanel />}
          {tab === 'skills' && <SkillsPanel />}
          {tab === 'sandbox' && <SandboxConnectPanel />}
          {tab === 'agent' && <AgentBotPanel />}
          {tab === 'embeds' && <EmbedsPanel />}
          {tab === 'workload' && <BotWorkloadPanel />}
        </>
      )}

      {/* Overlays every tab: the hub launcher opens this app's own chat window. */}
      <AppOwnedChatPanel />
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
