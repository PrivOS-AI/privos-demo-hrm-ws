import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { PrivosAppProvider, usePrivosContext } from '@privos_ai/app-react';
import { ThemeProvider, ThemeToggle } from './theme-provider';
import HRManagementDashboard from './contact-collector-form';
import FileUploadPanel from './file-upload-panel';
import AiPoemPanel from './ai-poem-panel';
import SkillsPanel from './skills-panel';
import SandboxConnectPanel from './sandbox-connect-panel';
import WhoamiPanel from './whoami-panel';
import InfoPanel from './info-panel';
import LicensePanel from './license-panel';
import AppOwnedChatPanel from './app-owned-chat-panel';
import AgentBotPanel from './agent-bot-panel';
import AssigneeDemoPanel from './assignee-demo-panel';
import AttemptLifecyclePanel from './attempt-lifecycle-panel';
import AttemptEvidencePanel from './attempt-evidence-panel';
import AppObjectsPanel from './app-objects-panel';
import AppDbPanel from './app-db-panel';
import NotificationPanel from './notification-panel';
import { LazyBoundary } from './lazy-boundary';

// Heavy panels split into their own chunks — loaded only when their tab is
// opened, so a cold app open never pays for AI chat/history rendering,
// workspace-factory upload plumbing, embed iframes, or the storage demo.
const AiChatPanel = lazy(() => import('./panels/ai-chat-panel'));
const AiHistoryPanel = lazy(() => import('./panels/ai-history-panel'));
const AgentSetUploadPanel = lazy(() => import('./panels/agent-set-upload-panel'));
const BotWorkloadPanel = lazy(() => import('./panels/bot-workload-panel'));
const EmbedsPanel = lazy(() => import('./panels/embeds-panel'));
const StoragePanel = lazy(() => import('./panels/storage-panel'));

declare global {
  interface Window {
    /** Set once React has committed the first render — the shell watchdog's success signal. */
    __privosUiBooted?: boolean;
  }
}

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
  | 'agentSets'
  | 'agent'
  | 'embeds'
  | 'workload'
  | 'assignees'
  | 'attemptLifecycle'
  | 'attemptEvidence'
  | 'appObjects'
  | 'appDb'
  | 'storage'
  | 'notification';

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
  { id: 'agentSets', label: 'Agent sets', scope: 'sandbox:agent-sets:upload', degradedBehavior: 'Uploading agent sets into the workspace factory is disabled.' },
  { id: 'agent', label: 'Agent bot' },
  // No scope: embedding is governed by the admin's per-app origin allowlist, not a grant.
  { id: 'embeds', label: 'Embeds' },
  // No single scope: the panel itself shows granted/not-granted per lifecycle scope.
  { id: 'workload', label: 'Bot workload' },
  { id: 'assignees', label: 'Isolated ASSIGNEE', scope: 'lists:write', degradedBehavior: 'This demo needs write access to create the isolated list and item.' },
  // Step-1 generic platform contract (merged hub bff01ee8, live only on tenant.132+). Both run as
  // the current user under the already-approved sandbox:generate scope — no new permission.
  { id: 'attemptLifecycle', label: 'Attempt lifecycle', scope: 'sandbox:generate', degradedBehavior: 'This tab cannot dispatch, observe, or cancel a Sandbox attempt.' },
  { id: 'attemptEvidence', label: 'Attempt evidence', scope: 'sandbox:generate', degradedBehavior: "This tab cannot read a Sandbox attempt's LLM/gateway evidence." },
  // Both run through this app's own installation-bot credential, not the current user's session —
  // see app-objects-panel.tsx / app-db-panel.tsx.
  { id: 'appObjects', label: 'App Objects (CAS)', scope: 'db:write', degradedBehavior: 'This tab cannot store or read App Objects (CAS) content.' },
  { id: 'appDb', label: 'App Database', scope: 'db:schema:write', degradedBehavior: 'This tab cannot register or use its demo App Database collection.' },
  // No scope: host storage is a browser-local, per-app namespace mediated by the host.
  { id: 'storage', label: 'Storage' },
  { id: 'notification', label: 'Notification', scope: 'notifications:write', degradedBehavior: 'This app cannot send notifications to room members.' },
];

function FeatureUnavailable({ text }: { text: string }) {
  return (
    <div className="container">
      <h1>Optional feature unavailable</h1>
      <div className="error-message">{text} An administrator can enable the optional permission in app settings.</div>
    </div>
  );
}

/** Suspense + error boundary shared by every lazily loaded panel. */
function LazyPanel({ children }: { children: ReactNode }) {
  return (
    <LazyBoundary>
      <Suspense fallback={<div className="container"><p className="loading-text">Loading…</p></div>}>
        {children}
      </Suspense>
    </LazyBoundary>
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
          {tab === 'agentSets' && <LazyPanel><AgentSetUploadPanel /></LazyPanel>}
          {tab === 'info' && <InfoPanel />}
          {tab === 'records' && <HRManagementDashboard />}
          {tab === 'license' && <LicensePanel />}
          {tab === 'files' && <FileUploadPanel />}
          {tab === 'chat' && <LazyPanel><AiChatPanel /></LazyPanel>}
          {tab === 'poem' && <AiPoemPanel />}
          {tab === 'history' && <LazyPanel><AiHistoryPanel /></LazyPanel>}
          {tab === 'skills' && <SkillsPanel />}
          {tab === 'sandbox' && <SandboxConnectPanel />}
          {tab === 'agent' && <AgentBotPanel />}
          {tab === 'embeds' && <LazyPanel><EmbedsPanel /></LazyPanel>}
          {tab === 'workload' && <LazyPanel><BotWorkloadPanel /></LazyPanel>}
          {tab === 'assignees' && <AssigneeDemoPanel />}
          {tab === 'attemptLifecycle' && <AttemptLifecyclePanel />}
          {tab === 'attemptEvidence' && <AttemptEvidencePanel />}
          {tab === 'appObjects' && <AppObjectsPanel />}
          {tab === 'appDb' && <AppDbPanel />}
          {tab === 'storage' && <LazyPanel><StoragePanel /></LazyPanel>}
          {tab === 'notification' && <NotificationPanel />}
        </>
      )}

      {/* Overlays every tab: the hub launcher opens this app's own chat window. */}
      <AppOwnedChatPanel />
    </ThemeProvider>
  );
}

export default function App() {
  useEffect(() => {
    window.__privosUiBooted = true;
  }, []);

  return (
    <PrivosAppProvider>
      <ThemedApp />
    </PrivosAppProvider>
  );
}
