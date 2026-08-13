/**
 * Pure helpers for the ASSIGNEE multi-user demo panel (create an isolated list
 * -> add an `ASSIGNEE` field -> create an item -> assign several users at once
 * -> read the value back). Kept separate from the React panel so payload shape
 * and the Hub's assignee-value parsing are unit-testable without a DOM.
 *
 * Field type note: the Hub's list field type for assigning users is `ASSIGNEE`
 * (`apps/meteor/server/core-typings/IList.ts`). Older docs referencing
 * `USER_SELECT` or `MEMBER_SELECT` describe field types that do not exist in
 * the Hub — see README.md "Isolated list, multi-user assignment demo".
 *
 * Why ASSIGNEE decides visibility: for an isolated list, the Hub shows an item
 * only to the room owner/admin, the item's creator, and the users listed in
 * its `ASSIGNEE` field(s) (`apps/meteor/app/api/server/lib/isolated-list-item-filter.ts`,
 * the `getAssignedUserIds` parse + the visibility check that consumes it).
 * Assigning several users to one ASSIGNEE field is what puts all of them on
 * that allow list at once.
 */

/** Split a free-text "userId1, userId2 userId3" input into a deduped id list. */
export function parseUserIdList(raw: string): string[] {
  const ids = raw.split(/[,\s]+/).map((id) => id.trim()).filter(Boolean);
  return Array.from(new Set(ids));
}

/**
 * Build the `mcpapp.lists.updateCustomField` value for a multi-user ASSIGNEE
 * assignment: an array of bare user-id strings. `getAssignedUserIds` also
 * accepts a single bare id or a `{ _id }` object per entry, but an array of
 * bare ids is the simplest shape that carries several assignees at once —
 * which is the exact case this demo exists to show.
 */
export function buildAssigneeValue(userIds: string[]): string[] {
  return Array.from(new Set(userIds.map((id) => id.trim()).filter(Boolean)));
}

/**
 * Mirror the Hub's `getAssignedUserIds` parsing (bare-id string, `{ _id }`
 * object, or an array of either) so the panel can confirm exactly which user
 * ids the Hub will treat as assigned, regardless of which of those shapes the
 * read-back custom field value used.
 */
export function normalizeAssignedUserIds(value: unknown): string[] {
  const toId = (entry: unknown): string | null => {
    if (typeof entry === 'string' && entry.trim()) return entry.trim();
    if (entry && typeof entry === 'object' && typeof (entry as { _id?: unknown })._id === 'string') {
      return (entry as { _id: string })._id;
    }
    return null;
  };
  const entries: unknown[] = Array.isArray(value) ? value : [value];
  const ids = entries.map(toId).filter((id): id is string => id !== null);
  return Array.from(new Set(ids));
}

/** Do the ids the panel sent and the ids the Hub read back match, order-insensitive? */
export function assignedIdsMatch(sent: string[], readBack: string[]): boolean {
  if (sent.length !== readBack.length) return false;
  const sentSet = new Set(sent);
  return readBack.every((id) => sentSet.has(id));
}
