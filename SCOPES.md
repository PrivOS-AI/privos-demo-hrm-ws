# Permission justifications

`privos-app.json` is the authoritative declaration. This table maps every permission to a shipped
call site and explains the behavior when an optional permission is absent.

| Permission | Requirement | Execution | Why / call site | Behavior when absent |
|---|---|---|---|---|
| `basic:information` | Required | Room; user + background | Loads installation and room context in `info-panel.tsx` and validates workload context. | Installation is cancelled if rejected. |
| `bot:agent:create` | Optional | Workspace; user | Creates one installation-owned agent bot in `agent-bot-panel.tsx`. | Bot creation is disabled; other approved agent-bot actions remain visible. |
| `bot:room:join` | Optional | Room; user | Adds only the installation-owned bot to the Hub-resolved current Room in `agent-bot-panel.tsx`. | The bot cannot be added to this Room. |
| `bot:identity:read` | Optional | Room; user | Reads safe bot identity in `agent-bot-panel.tsx` only after ordinary membership in the Hub-resolved current Room is verified; also used by `bot-workload-panel.tsx` and, best-effort, `ai-chat-panel.tsx` to offer the installation bot as an AI Chat agent option. | Current-Room bot identity is unavailable. |
| `lists:read` | Required | Room; user | Reads HR lists, fields, stages, and items in `contact-collector-form.tsx`, `list-items-table.tsx`, and `assignee-demo-panel.tsx` (`mcpapp.lists.getItems`). | Installation is cancelled if rejected. |
| `lists:query` | Optional | Room; user | Pages and searches records in `list-items-table.tsx` through `items.query`: windowed load, "Load more" by cursor, text search, and an incremental sync that asks only for what changed since the last load. | The table falls back to `items.listByListId`, which answers with at most 500 items, and says so. |
| `lists:write` | Optional | Room; user | Creates and edits HR lists, fields, and records in the Records panel, and in `assignee-demo-panel.tsx` demonstrates creating an isolated list, an `ASSIGNEE` field, and assigning several users to one item via `mcpapp.lists.create` / `addField` / `createItem` / `updateCustomField`. | Records remain readable; create/edit/delete controls are disabled; the ASSIGNEE demo tab is disabled. |
| `custom-permissions:read` | Optional | Room; user | Reads the room's custom-permission catalog and each permission's members in `custom-permissions-panel.tsx` via `mcpapp.rooms.customPermissions.list` / `.members`. | The Custom permissions tab cannot display the catalog or membership. |
| `custom-permissions:write` | Optional | Room; user | Grants an isolated-list item's `additionalReaders`/`additionalEditors` to a custom permission in `custom-permissions-panel.tsx` via `mcpapp.rooms.customPermissions.setItemAccess`. The Hub still requires the acting user to be room owner/admin and every id to exist in the room catalog. | The Custom permissions tab can read but cannot grant item access. |
| `notifications:write` | Optional | Room; user | The Notification tab calls `mcpapp.notifications.create` to notify one active member of the exact approved room. The Hub creates a bell record and mirrors it to native mobile and Web Push. | The Notification tab cannot send notifications. |
| `files:read` | Optional | Room; user | Lists and previews room files in `file-upload-panel.tsx`. | The Files panel is hidden with an explanation. |
| `files:write` | Optional | Room; user | Uploads files via `app.uploadFile()` in `file-upload-panel.tsx` and record file fields. | Upload buttons and file fields are disabled. |
| `sandbox:skills:use` | Optional | Room; user | Lists what the sandbox offers this room and saves the selection in `skills-panel.tsx`, as two complete selections — standalone skills and agent sets — because each array is the desired state for its own kind. | Skill and agent-set controls are hidden. |
| `sandbox:agent-sets:upload` | Optional | Workspace; user | Uploads an agent set into the workspace factory in `agent-set-upload-panel.tsx`: preview a base64 archive, then commit the batch. The scope only widens the paths this app may reach — the Hub still requires the acting user to hold `manage-privos-agent-sets` (admin-only), and records both the user and the attested app as provenance. | The Agent sets tab is disabled; selecting already-uploaded sets is unaffected. |
| `sandbox:generate` | Optional | Room; user | Starts and polls a Sandbox attempt in `bot-workload-attempt-section.tsx`, optionally selecting the installation-owned agent bot as executor via `botId` (never a `projectId`). | The Bot workload tab cannot start or poll a Sandbox attempt. |
| `sandbox:botkey:push` | Optional | Room; user | Reads bot-key status and performs a push in `sandbox-connect-panel.tsx` — either explicitly, or as the single automatic re-sync the Hub allows when it reports the sandbox holds a bot key it never pushed (`botkey-autopush-controller.ts`). | Sandbox connection controls are hidden and no automatic re-sync is attempted. |
| `sandbox:wake` | Optional | Room; user | Wakes and polls the room sandbox in `sandbox-connect-panel.tsx`. | Wake is disabled while other granted sandbox controls remain usable. |
| `sandbox:ai-chat` | Optional | Room; user | Reads sessions/history in `ai-chat-panel.tsx`, `ai-poem-panel.tsx`, and `ai-history-panel.tsx`. | Existing AI sessions are not displayed. |
| `sandbox:ai-chat:write` | Optional | Room; user | Starts, sends, cancels, and generates AI work in the chat and poem panels. | Creation/generation panels are disabled; separately granted read history remains available. |
| `db:read` | Optional | Room; user | Reads App Database records and App Objects (CAS) metadata/content in `app-objects-panel.tsx` / `app-db-panel.tsx`, via `mcpapp.objects.head`/`.get` and `mcpapp.db.query`/`.getSchema`. Step-1 generic platform contract; live only on tenant.132+. | The App Objects and App Database tabs cannot read anything back. |
| `db:write` | Optional | Room; user | Stores an immutable content-addressed object and creates App Database records in `app-objects-panel.tsx` / `app-db-panel.tsx`, via `mcpapp.objects.put` and `mcpapp.db.create`. Step-1 generic platform contract; live only on tenant.132+. | The App Objects and App Database tabs cannot store or create anything. |
| `db:schema:read` | Optional | Room; user | Reads the demo App Database collection's schema in `app-db-panel.tsx`, via `mcpapp.db.getSchema`. Step-1 generic platform contract; live only on tenant.132+. | The App Database tab cannot display its collection schema. |
| `db:schema:write` | Optional | Room; user | Registers the demo App Database collection's schema in `app-db-panel.tsx`, via `mcpapp.db.registerCollection`. Step-1 generic platform contract; live only on tenant.132+. | The App Database tab cannot register its demo collection. |

The App Objects and App Database tabs are the one exception to "runs as the current user": both
scopes above are exercised through this app's own installation-bot credential
(`POST /api/v1/mcp-apps.tool-call`, see `app-platform-tool-call.ts`), not the current user's
session — see README.md § App Platform demo tabs.

The app-owned `hr_bulk_export` tool does not request a workspace permission. It processes caller
input and is gated by the Pro license feature. The Hub still enforces installation status, receipt,
epoch, target room, exact grant, and current-user ACL on every mediated platform operation.
