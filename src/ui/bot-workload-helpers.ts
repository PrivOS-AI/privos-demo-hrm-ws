/**
 * Pure helpers for the Bot workload demo tab (create bot -> join Room ->
 * pick executor -> generate-async -> poll -> question in the Room thread).
 * Kept separate from the React panels so payload shape and error mapping are
 * unit-testable without a DOM.
 *
 * This app never issues the bot's Hub credential — that surface was removed:
 * a workspace admin issues it from Admin > Apps > this app > Settings, and
 * it reaches the app only through its own declared secret env var.
 */

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
