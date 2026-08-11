/**
 * Executor selector for the AI Chat panel — offers the room's default bot
 * (unchanged default behavior) and, when known, the installation-owned agent
 * bot created on the Bot workload tab. See `ai-chat-bot-selection.ts` for the
 * asymmetry this exposes: that installation bot can run Sandbox attempts but
 * has no AI Chat token, so selecting it here is expected to fail — the panel
 * still offers it, with this note, rather than hiding a real capability.
 */
interface Identity {
  botId: string;
  username: string;
}

interface Props {
  identity: Identity | null;
  selected: 'default' | 'installation';
  onChange: (value: 'default' | 'installation') => void;
  disabled?: boolean;
}

export default function AiChatExecutorSelect({ identity, selected, onChange, disabled }: Props) {
  return (
    <div className="form-group" style={{ marginBottom: 8 }}>
      <label htmlFor="chat-executor">AI Chat agent</label>
      <select
        id="chat-executor"
        value={selected}
        onChange={(event) => onChange(event.target.value as 'default' | 'installation')}
        disabled={disabled}
      >
        <option value="default">Room default bot (current behavior)</option>
        <option value="installation" disabled={!identity}>
          {identity ? `Installation bot — @${identity.username}` : 'Installation bot (join it to this Room first)'}
        </option>
      </select>
      {selected === 'installation' && (
        <p className="empty-text" style={{ textAlign: 'left', padding: '4px 0 0' }}>
          Installation-owned agent bots authenticate with a personal-access credential, not the
          chat token <code>ai-messages.send</code> requires — this send is expected to fail. The
          same bot CAN run as a Sandbox executor on the Bot workload tab.
        </p>
      )}
    </div>
  );
}
