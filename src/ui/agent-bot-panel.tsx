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

type AgentBotAction = 'create' | 'join' | 'read';

const ERROR_MESSAGES: Record<string, string> = {
  BOT_AGENT_CREATE_DENIED: 'Bot creation is not approved for this installation or user.',
  BOT_AGENT_INVALID_INPUT: 'Enter a valid name, username, and purpose.',
  BOT_AGENT_USERNAME_EXISTS: 'That username is already in use.',
  BOT_AGENT_LICENSE_LIMIT_REACHED: 'The workspace license does not allow another agent bot.',
  BOT_AGENT_CREATION_IN_PROGRESS: 'Another request is creating this installation bot.',
  BOT_AGENT_NOT_CONFIGURED: 'Create the installation agent bot first.',
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
  const [name, setName] = useState('PrivOS Demo Agent');
  const [username, setUsername] = useState('');
  const [purpose, setPurpose] = useState('Assist people in approved PrivOS Rooms.');
  const [identity, setIdentity] = useState<AgentBotIdentity | null>(null);
  const [busy, setBusy] = useState<AgentBotAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canCreate = effectiveScopes?.includes('bot:agent:create') === true;
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

  async function createAgent() {
    const result = await callTool<AgentBotIdentity>('create', 'mcpapp.bot.createAgent', {
      name: name.trim(),
      username: username.trim(),
      agentData: { purpose: purpose.trim() },
    });
    if (!result) return;
    setIdentity(result);
    setNotice(result.created ? 'Installation agent bot created.' : 'This installation already owns that agent bot.');
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
        Create one bot for this app installation, then explicitly add or read it only in the Room selected by the Hub.
        These calls never send a Room ID, bot ID, bot token, or bot secret.
      </p>

      <ul className="file-list" aria-label="Agent bot approval scopes">
        <ScopeStatus scope="bot:agent:create" granted={canCreate} />
        <ScopeStatus scope="bot:room:join" granted={canJoin} />
        <ScopeStatus scope="bot:identity:read" granted={canRead} />
      </ul>

      {error && <div className="error-message" role="alert">{error}</div>}
      {notice && <div className="items-count" role="status">{notice}</div>}

      <div className="form-group">
        <label htmlFor="agent-name">Bot name</label>
        <input id="agent-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={200} />
      </div>
      <div className="form-group">
        <label htmlFor="agent-username">Unique username</label>
        <input
          id="agent-username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="privos-demo-agent"
          maxLength={100}
          pattern="[A-Za-z0-9._-]+"
          autoCapitalize="none"
        />
      </div>
      <div className="form-group">
        <label htmlFor="agent-purpose">Purpose</label>
        <textarea id="agent-purpose" value={purpose} onChange={(event) => setPurpose(event.target.value)} maxLength={2000} rows={3} />
      </div>

      <div className="form-actions">
        <button
          type="button"
          className="btn-submit"
          onClick={createAgent}
          disabled={!canCreate || busy !== null || !name.trim() || !username.trim() || !purpose.trim()}
        >
          {busy === 'create' ? 'Creating…' : 'Create installation bot'}
        </button>
        <button type="button" onClick={joinCurrentRoom} disabled={!canJoin || busy !== null}>
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
