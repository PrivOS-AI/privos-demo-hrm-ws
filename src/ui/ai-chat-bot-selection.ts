/**
 * Executor bot selection for the AI Chat REST flow — pure payload/error
 * helpers, split out so they are unit-testable without rendering the panel.
 *
 * Asymmetry this file exists to document (see `ai-chat-panel.tsx` and
 * `bot-workload-attempt-section.tsx` for the two surfaces named): an
 * installation-owned agent bot (created by a workspace administrator in Admin >
 * Apps > Settings) CAN be selected as a Sandbox EXECUTOR on
 * `agents.sandbox.generate-async` — it only needs an active bot-key push —
 * but it CANNOT currently be selected as an AI CHAT agent on
 * `ai-messages.send`. That call resolves the selected bot's token from a
 * `BotTokens` row, and installation-owned bots authenticate with a
 * personal-access credential instead, so the Hub returns "Invalid bot: no
 * active token (bot was not provisioned correctly)".
 */
const INSTALLATION_BOT_NO_TOKEN_MARKER = 'no active token';

export function isInstallationBotProvisioningError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return message.toLowerCase().includes(INSTALLATION_BOT_NO_TOKEN_MARKER);
}

/**
 * Build the `ai-messages.send` REST body. With no `botId` this returns
 * exactly the same key set as the pre-existing payload — the legacy
 * room-default-bot path stays byte-identical.
 */
export function buildSendMessageBody(params: {
  roomId: string;
  content: string;
  fileId?: string;
  sessionId?: string | null;
  botId?: string | null;
}): Record<string, unknown> {
  const { roomId, content, fileId, sessionId, botId } = params;
  return {
    entityType: 'room-chat',
    entityId: roomId,
    roomId,
    flowChatId: roomId,
    content,
    ...(fileId ? { fileIds: [fileId] } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(botId ? { botId } : {}),
  };
}
