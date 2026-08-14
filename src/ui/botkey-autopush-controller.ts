/**
 * Bot-key auto-sync controller.
 *
 * A room's sandbox can end up holding a bot key the hub never pushed — after a
 * token rotation, a workspace restore, or a sandbox rebuild. Until it is
 * re-synced every agent call from this app fails, and the only way out used to
 * be for the user to notice the "Sandbox" tab and press Connect.
 *
 * The hub already repairs itself when someone chats. This gives the app the
 * same reflex, under the same rules — it does not invent detection of its own:
 *
 *   - it reacts only to the hub's own signals (the coded rejection on an
 *     attempt, or a `sandbox-key-stale` reason on the status read the panel
 *     already performs). Never a timer, never a poll of its own;
 *   - it asks for a *plain* sync (`auto: true`). Force-overwrite and bootstrap
 *     stay behind their manual confirmations, because those overwrite a
 *     workspace;
 *   - the hub decides whether: it refuses a repeat of a sync that already
 *     failed for this same key. This app does not pre-check that — it asks and
 *     honours the coded refusal. The cooldown here is the second belt, stopping
 *     a re-ask after a refusal even across component remounts.
 */
import { useCallback, useState } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import { PrivosRestError, restCall } from './privos-rest';

/** The hub's code for "this project holds a bot key I did not push". */
export const BOT_KEY_OUTDATED_CODE = 'bot-key-outdated';

/** The hub's code for "the one automatic sync for this key is already spent". */
export const AUTO_PUSH_SPENT_CODE = 'auto-push-spent';

/** The scope both the status read and the sync call live under. */
export const BOT_KEY_PUSH_SCOPE = 'sandbox:botkey:push';

export type AutoPushPhase = 'idle' | 'running' | 'done' | 'manual-required';

/**
 * Rooms this session already tried and could not repair. Held at module scope
 * on purpose: a per-component ref would forget the refusal the moment the panel
 * re-mounted, and the user would watch the same doomed sync run again.
 */
const exhaustedRooms = new Set<string>();

/**
 * Did this failure come from the sandbox refusing the bot key?
 *
 * Matches the code, never the message — the wording is free to change, and a
 * failure that merely mentions a key is not the same as one the hub classified.
 */
export function isBotKeyOutdatedError(error: unknown): boolean {
	return error instanceof PrivosRestError && error.code === BOT_KEY_OUTDATED_CODE;
}

export function useBotKeyAutoPush() {
	const app = usePrivosApp();
	const { roomId, effectiveScopes } = usePrivosContext();
	const canSync = effectiveScopes?.includes(BOT_KEY_PUSH_SCOPE) === true;

	const [phase, setPhase] = useState<AutoPushPhase>('idle');
	const [message, setMessage] = useState<string | null>(null);

	/**
	 * Run the one automatic sync this room is entitled to.
	 *
	 * Resolves true only when the key was actually repaired, which is the
	 * caller's signal to retry the operation that failed. Everything else — no
	 * scope, no room, cooldown, the hub refusing — resolves false, and the
	 * caller shows its normal error next to the manual Connect button.
	 */
	const autoPush = useCallback(async (): Promise<boolean> => {
		if (!roomId || !canSync || exhaustedRooms.has(roomId)) return false;

		setPhase('running');
		setMessage('Re-syncing the sandbox bot key…');
		try {
			await restCall(app, 'POST', 'agents.sandbox.pushBotKey', { body: { roomId, auto: true } });
			setPhase('done');
			setMessage('Sandbox bot key re-synced.');
			return true;
		} catch (error) {
			// Whatever went wrong, this app does not get to try again on its own.
			// A spent sync would be refused identically; a failed one needs a
			// person to look at it.
			exhaustedRooms.add(roomId);
			setPhase('manual-required');
			setMessage(
				error instanceof PrivosRestError && error.code === AUTO_PUSH_SPENT_CODE
					? 'The automatic sandbox sync for this key was already used. Use Connect in the Sandbox tab.'
					: 'Automatic sandbox sync did not work. Use Connect in the Sandbox tab.',
			);
			return false;
		}
	}, [app, roomId, canSync]);

	/** Clear the cooldown after a manual sync succeeded, so automation may help again. */
	const reset = useCallback(() => {
		if (roomId) exhaustedRooms.delete(roomId);
		setPhase('idle');
		setMessage(null);
	}, [roomId]);

	/**
	 * Recover from a failed call when — and only when — the hub says the bot key
	 * is the reason. Resolves true if the caller should retry.
	 */
	const recoverFromError = useCallback(
		async (error: unknown): Promise<boolean> => {
			if (!isBotKeyOutdatedError(error)) return false;
			return autoPush();
		},
		[autoPush],
	);

	return { phase, message, canSync, autoPush, recoverFromError, reset };
}
