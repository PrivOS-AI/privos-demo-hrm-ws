/**
 * Bot workload panel — demonstrates the installation agent bot's full
 * execution lifecycle end to end: create the bot, join the current Room,
 * issue its Hub credential, then pick it (or the Room default bot) as the
 * executor for a Sandbox attempt (see `bot-workload-attempt-section.tsx`).
 *
 * The lifecycle calls below mirror `agent-bot-panel.tsx`'s pattern exactly —
 * no Room, bot, or token selector is ever sent; the Hub derives all of that
 * from the verified installation/Room context.
 *
 * `mcpapp.bot.issueCredential` takes no arguments and returns the bot's Hub
 * API credential exactly once. This panel never renders, logs, or stores
 * that value: see `bot-workload-helpers.ts`'s `extractIssuanceEvidence`,
 * which is the only place the tool result is touched. The credential belongs
 * in the app BACKEND — which can call the same tool through its own workload
 * identity — never a browser tab, which is exactly why this UI only ever
 * shows that issuance succeeded and when.
 */
import { useState } from 'react';
import { usePrivosApp, usePrivosContext, parseToolResult } from '@privos_ai/app-react';
import { mapCredentialIssueError, extractIssuanceEvidence } from './bot-workload-helpers';
import BotWorkloadAttemptSection from './bot-workload-attempt-section';

type BotIdentity = {
  botId: string;
  username: string;
  name: string;
  agentRoomId: string;
  roomId?: string;
  created?: boolean;
  joined?: boolean;
};

type LifecycleAction = 'create' | 'join' | 'read' | 'credential';

const LIFECYCLE_ERROR_MESSAGES: Record<string, string> = {
  BOT_AGENT_CREATE_DENIED: 'Bot creation is not approved for this installation or user.',
  BOT_AGENT_USERNAME_EXISTS: 'That username is already in use.',
  MCP_ROOM_SCOPE_DENIED: 'This action is not approved for the current Room.',
  BOT_NOT_MEMBER_OF_AUTHORIZED_ROOM: 'The bot has not joined the current Room yet — join it first.',
};

function safeLifecycleError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '');
  const code = Object.keys(LIFECYCLE_ERROR_MESSAGES).find((candidate) => message.includes(candidate));
  return code ? LIFECYCLE_ERROR_MESSAGES[code] : message || 'The Hub rejected the request.';
}

export default function BotWorkloadPanel() {
  const app = usePrivosApp();
  const { roomId, effectiveScopes } = usePrivosContext();

  const [username, setUsername] = useState('');
  const [identity, setIdentity] = useState<BotIdentity | null>(null);
  const [busy, setBusy] = useState<LifecycleAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [credentialIssuedAt, setCredentialIssuedAt] = useState<string | null>(null);

  const canCreate = effectiveScopes?.includes('bot:agent:create') === true;
  const canJoin = effectiveScopes?.includes('bot:room:join') === true;
  const canRead = effectiveScopes?.includes('bot:identity:read') === true;
  const canIssueCredential = effectiveScopes?.includes('bot:credential:issue') === true;
  const canGenerate = effectiveScopes?.includes('sandbox:generate') === true;

  async function callTool<T>(
    action: LifecycleAction,
    toolName: string,
    args: Record<string, unknown>,
    mapError: (error: unknown) => string = safeLifecycleError,
  ): Promise<T | null> {
    setBusy(action);
    setNotice(null);
    setError(null);
    try {
      return parseToolResult(await app.callServerTool({ name: toolName, arguments: args })) as T;
    } catch (toolError) {
      setError(mapError(toolError));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function createAgent() {
    const name = username.trim() ? `Workload Demo (${username.trim()})` : 'Workload Demo Agent';
    const result = await callTool<BotIdentity>('create', 'mcpapp.bot.createAgent', {
      name,
      username: username.trim(),
      agentData: { purpose: 'Run and demonstrate Sandbox generation workloads for this installation.' },
    });
    if (!result) return;
    setIdentity(result);
    setNotice(result.created ? 'Installation agent bot created.' : 'This installation already owns that agent bot.');
  }

  async function joinCurrentRoom() {
    const result = await callTool<BotIdentity>('join', 'mcpapp.bot.joinCurrentRoom', {});
    if (!result) return;
    setIdentity(result);
    setNotice(result.joined ? 'Agent bot joined the current Room.' : 'Agent bot is already a member of the current Room.');
  }

  async function readCurrentRoomIdentity() {
    const result = await callTool<BotIdentity>('read', 'mcpapp.bot.getCurrentRoomIdentity', {});
    if (!result) return;
    setIdentity(result);
    setNotice('Verified the installation agent bot for the current Room.');
  }

  async function issueCredential() {
    // No arguments — the Hub derives the bot exclusively from the verified
    // installation. `result` briefly holds the raw credential in this local
    // scope only; extractIssuanceEvidence is the only place it is read, and
    // only for the non-secret `issuedAt` field.
    const result = await callTool<{ issuedAt?: string }>('credential', 'mcpapp.bot.issueCredential', {}, mapCredentialIssueError);
    if (!result) return;
    const evidence = extractIssuanceEvidence(result);
    setCredentialIssuedAt(evidence.issuedAt);
    setNotice('Credential issued. The value itself was never rendered, logged, or stored by this app.');
  }

  return (
    <section className="container">
      <h1>Bot workload</h1>
      <p className="empty-text">
        Full lifecycle demo: create the installation bot, join it to this Room, issue its Hub
        credential, then run it as a Sandbox executor below.
      </p>

      <ul className="file-list" aria-label="Bot workload approval scopes">
        <ScopeStatus scope="bot:agent:create" granted={canCreate} />
        <ScopeStatus scope="bot:room:join" granted={canJoin} />
        <ScopeStatus scope="bot:identity:read" granted={canRead} />
        <ScopeStatus scope="bot:credential:issue" granted={canIssueCredential} />
        <ScopeStatus scope="sandbox:generate" granted={canGenerate} />
      </ul>

      {error && <div className="error-message" role="alert">{error}</div>}
      {notice && <div className="items-count" role="status">{notice}</div>}

      <div className="form-group">
        <label htmlFor="workload-username">Unique username (for creation only)</label>
        <input
          id="workload-username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="privos-workload-demo"
          maxLength={100}
          pattern="[A-Za-z0-9._-]+"
          autoCapitalize="none"
          disabled={busy !== null}
        />
      </div>

      <div className="form-actions">
        <button type="button" className="btn-submit" onClick={createAgent} disabled={!canCreate || busy !== null || !username.trim()}>
          {busy === 'create' ? 'Creating…' : 'Create bot'}
        </button>
        <button type="button" onClick={joinCurrentRoom} disabled={!canJoin || busy !== null}>
          {busy === 'join' ? 'Joining…' : 'Join current Room'}
        </button>
        <button type="button" onClick={readCurrentRoomIdentity} disabled={!canRead || busy !== null}>
          {busy === 'read' ? 'Checking…' : 'Read identity'}
        </button>
      </div>

      {identity && (
        <ul className="file-list" aria-label="Bot workload identity">
          <IdentityRow label="Username" value={`@${identity.username}`} />
          <IdentityRow label="Bot ID" value={identity.botId} />
          {identity.roomId && <IdentityRow label="Authorized Room" value={identity.roomId} />}
        </ul>
      )}

      <div className="form-actions" style={{ marginTop: 8 }}>
        <button type="button" onClick={issueCredential} disabled={!canIssueCredential || busy !== null || !identity}>
          {busy === 'credential' ? 'Issuing…' : 'Issue Hub credential'}
        </button>
      </div>
      {credentialIssuedAt && (
        <p className="empty-text" style={{ textAlign: 'left' }}>
          Issued at {new Date(credentialIssuedAt).toLocaleString()}. The raw credential is a
          backend secret — it belongs behind this app's own server, authenticating its own Hub
          REST calls as this bot, never in a browser tab.
        </p>
      )}

      <BotWorkloadAttemptSection app={app} roomId={roomId} identity={identity} canGenerate={canGenerate} />
    </section>
  );
}

function ScopeStatus({ scope, granted }: { scope: string; granted: boolean }) {
  return (
    <li className="file-row">
      <span className="file-name"><code>{scope}</code></span>
      <span className="file-size">{granted ? 'Approved' : 'Not approved'}</span>
    </li>
  );
}

function IdentityRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="file-row">
      <span className="file-name">{label}</span>
      <span className="file-size">{value}</span>
    </li>
  );
}
