/**
 * Pure helpers for the Custom permissions demo panel. Kept separate from the
 * React panel so payload shape is unit-testable without a DOM, mirroring
 * `assignee-demo-helpers.ts`.
 *
 * Field contract (`apps/meteor/server/services/mcp-tool-handlers-room-custom-permissions.ts`
 * and `apps/meteor/app/api/server/lib/item-grant-field-write-policy.ts` in the Hub):
 * an isolated-list item's `additionalReaders`/`additionalEditors` are plain arrays of
 * custom-permission ids (not user ids) — anyone whose `Subscription.customPermissions`
 * contains one of those ids may read (or read+edit) the item, in addition to the room
 * owner/admin, the item's creator, and any ASSIGNEE. Both fields are additive and
 * independent: an id can be listed in one, both, or neither.
 */

export interface CustomPermissionRef {
  _id: string;
  name: string;
  description?: string;
}

/** Merge a permission id into an existing grant array without duplicating it. */
export function addPermissionIdToGrant(existing: string[] | undefined, permissionId: string): string[] {
  const ids = new Set(existing ?? []);
  ids.add(permissionId);
  return Array.from(ids);
}

/**
 * Build the `mcpapp.rooms.customPermissions.setItemAccess` patch that grants one
 * permission's holders read access, edit access, or both — merging into whatever
 * grant arrays the item already carries so an existing grant is never dropped.
 */
export function buildItemAccessPatch(
  permissionId: string,
  current: { additionalReaders?: string[]; additionalEditors?: string[] },
  grant: { asReader: boolean; asEditor: boolean },
): { additionalReaders?: string[]; additionalEditors?: string[] } {
  const patch: { additionalReaders?: string[]; additionalEditors?: string[] } = {};
  if (grant.asReader) patch.additionalReaders = addPermissionIdToGrant(current.additionalReaders, permissionId);
  if (grant.asEditor) patch.additionalEditors = addPermissionIdToGrant(current.additionalEditors, permissionId);
  return patch;
}

/** Does the id set (order-insensitive) contain `permissionId`? */
export function grantIncludes(ids: string[] | undefined, permissionId: string): boolean {
  return Array.isArray(ids) && ids.includes(permissionId);
}

/** Find a permission in the catalog by id, for resolving a name to display. */
export function findPermissionName(catalog: CustomPermissionRef[], permissionId: string): string {
  return catalog.find((p) => p._id === permissionId)?.name ?? permissionId;
}
