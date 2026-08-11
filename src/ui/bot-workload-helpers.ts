/**
 * Pure helpers for the Bot workload demo tab (create bot -> join Room ->
 * issue credential -> pick executor -> generate-async -> poll -> question in
 * the Room thread). Kept separate from the React panels so payload shape and
 * error mapping are unit-testable without a DOM.
 */

/**
 * `mcpapp.bot.issueCredential` fails with two DISTINCT codes on purpose: one
 * means "you personally are not authorized to issue this," the other means
 * "an operator switched issuance off for everyone." Conflating them sends
 * whoever reads the error to investigate the wrong thing — a caller looking
 * for the wrong permission, or an operator missing that they hold the switch.
 */
export const CREDENTIAL_ISSUE_ERROR_MESSAGES: Record<string, string> = {
  BOT_CREDENTIAL_ISSUE_DENIED:
    'You are not the installer, the bot associator, or a workspace admin — credential issuance is not authorized for you.',
  BOT_CREDENTIAL_ISSUE_DISABLED: 'An operator has turned off agent bot credential issuance for this workspace.',
};

export function mapCredentialIssueError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '');
  const code = Object.keys(CREDENTIAL_ISSUE_ERROR_MESSAGES).find((candidate) => message.includes(candidate));
  return code ? CREDENTIAL_ISSUE_ERROR_MESSAGES[code] : message || 'The Hub rejected the credential issuance request.';
}

/**
 * Keep only non-secret issuance evidence. The raw `credential` field on the
 * tool result is never read anywhere else in this app — it is destructured
 * away right here and falls out of scope the moment this function returns,
 * so it is never assigned to component state, logged, or rendered. The
 * credential belongs in the app BACKEND, which can call this same tool
 * through its own workload identity; a browser tab is the wrong place for
 * a secret that outlives one call.
 */
export function extractIssuanceEvidence(result: { issuedAt?: unknown }): { issuedAt: string | null } {
  return { issuedAt: typeof result?.issuedAt === 'string' ? result.issuedAt : null };
}

/**
 * Build the `agents.sandbox.generate-async` REST payload. `botId` — the
 * executor — is the ONE legitimate caller-supplied selector on this call:
 * the Hub independently re-validates it names an active `type:'bot'` member
 * of the CURRENT room and derives the Sandbox project from THAT bot, never
 * from a caller-supplied `projectId`. Omitting `botId` keeps the legacy
 * room-default-bot behavior byte-identical.
 */
export function buildGenerateAsyncPayload(params: {
  roomId: string;
  prompt: string;
  taskId: string;
  taskTitle: string;
  botId?: string;
}): Record<string, unknown> {
  const { roomId, prompt, taskId, taskTitle, botId } = params;
  return {
    roomId,
    prompt,
    taskId,
    taskTitle,
    ...(botId ? { botId } : {}),
  };
}

/** Mirrors the Hub's terminal attempt statuses plus the local 'unknown' the poll loop can report. */
export const ATTEMPT_TERMINAL = new Set(['completed', 'failed', 'cancelled', 'unknown']);
