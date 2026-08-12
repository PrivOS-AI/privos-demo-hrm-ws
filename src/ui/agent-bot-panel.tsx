import { useState } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';

type AgentBotIdentity = {
  botId: string;
  username: string;
  name: string;
  agentRoomId: string;
  roomId?: string;
  created?: boolean;
  joined?: boolean;
  membershipStatus?: 'member';
};

type AgentBotAction = 'join' | 'read';

const ERROR_MESSAGES: Record<string, string> = {
  BOT_AGENT_CREATION_IN_PROGRESS: 'An administrator is creating this installation bot right now.',
  BOT_AGENT_NOT_CONFIGURED: 'Ask a workspace administrator to create this installation bot first.',
  BOT_AGENT_CONFIGURATION_INVALID: 'The installation bot configuration is no longer valid.',
  MCP_ROOM_SCOPE_DENIED: 'This action is not approved for the current Room.',
  BOT_NOT_MEMBER_OF_AUTHORIZED_ROOM: 'The installation bot has not joined the current Room.',
};

function parseToolResult<T>(result: any): T {
  const text = result?.content?.[0]?.text;
  return (typeof text === 'string' ? JSON.parse(text) : result) as T;
}

function safeToolError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '');
  const code = Object.keys(ERROR_MESSAGES).find((candidate) => message.includes(candidate));
  return code ? ERROR_MESSAGES[code] : message || 'The Hub rejected the agent bot request.';
}

export default function AgentBotPanel() {
  const app = usePrivosApp();
  const { effectiveScopes } = usePrivosContext();
  const [identity, setIdentity] = useState<AgentBotIdentity | null>(null);
  const [busy, setBusy] = useState<AgentBotAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canJoin = effectiveScopes?.includes('bot:room:join') === true;
  const canRead = effectiveScopes?.includes('bot:identity:read') === true;

  async function callTool<T>(action: AgentBotAction, toolName: string, args: Record<string, unknown>): Promise<T | null> {
    setBusy(action);
    setNotice(null);
    setError(null);
    try {
      return parseToolResult<T>(await app.callServerTool({ name: toolName, arguments: args }));
    } catch (toolError) {
      setError(safeToolError(toolError));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function joinCurrentRoom() {
    // No Room or bot selector is sent. The Hub resolves both from the verified installation context.
    const result = await callTool<AgentBotIdentity>('join', 'mcpapp.bot.joinCurrentRoom', {});
    if (!result) return;
    setIdentity(result);
    setNotice(result.joined ? 'Agent bot joined the current Room.' : 'Agent bot is already a member of the current Room.');
  }

  async function readCurrentRoomIdentity() {
    // The Hub returns identity only after verifying ordinary membership in its resolved Room.
    const result = await callTool<AgentBotIdentity>('read', 'mcpapp.bot.getCurrentRoomIdentity', {});
    if (!result) return;
    setIdentity(result);
    setNotice('Verified the installation agent bot for the current Room.');
  }

  return (
    <section className="container">
      <h1>Installation agent bot</h1>
      <p className="empty-text">
        This installation's bot is created by a workspace administrator in Admin &gt; Apps &gt;
        Settings, under the name and username this app's manifest declares. From here the app can
        only add it to, or read it in, the Room the Hub selected — these calls never send a Room
        ID, bot ID, bot token, or bot secret.
      </p>

      <ul className="file-list" aria-label="Agent bot approval scopes">
        <ScopeStatus scope="bot:room:join" granted={canJoin} />
        <ScopeStatus scope="bot:identity:read" granted={canRead} />
      </ul>

      {error && <div className="error-message" role="alert">{error}</div>}
      {notice && <div className="items-count" role="status">{notice}</div>}

      <div className="form-actions">
        <button type="button" className="btn-submit" onClick={joinCurrentRoom} disabled={!canJoin || busy !== null}>
          {busy === 'join' ? 'Joining…' : 'Join current Room'}
        </button>
        <button type="button" onClick={readCurrentRoomIdentity} disabled={!canRead || busy !== null}>
          {busy === 'read' ? 'Checking…' : 'Read current Room identity'}
        </button>
      </div>

      {identity && (
        <ul className="file-list" aria-label="Agent bot identity">
          <IdentityRow label="Name" value={identity.name} />
          <IdentityRow label="Username" value={`@${identity.username}`} />
          <IdentityRow label="Bot ID" value={identity.botId} />
          <IdentityRow label="Canonical agent Room" value={identity.agentRoomId} />
          {identity.roomId && <IdentityRow label="Authorized Room" value={identity.roomId} />}
          {identity.membershipStatus && <IdentityRow label="Membership" value={identity.membershipStatus} />}
        </ul>
      )}
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
