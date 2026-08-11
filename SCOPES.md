# Permission justifications

`privos-app.json` is the authoritative declaration. This table maps every permission to a shipped
call site and explains the behavior when an optional permission is absent.

| Permission | Requirement | Execution | Why / call site | Behavior when absent |
|---|---|---|---|---|
| `basic:information` | Required | Room; user + background | Loads installation and room context in `info-panel.tsx` and validates workload context. | Installation is cancelled if rejected. |
| `bot:agent:create` | Optional | Workspace; user | Creates one installation-owned agent bot in `agent-bot-panel.tsx`. | Bot creation is disabled; other approved agent-bot actions remain visible. |
| `bot:room:join` | Optional | Room; user | Adds only the installation-owned bot to the Hub-resolved current Room in `agent-bot-panel.tsx`. | The bot cannot be added to this Room. |
| `bot:identity:read` | Optional | Room; user | Reads safe bot identity in `agent-bot-panel.tsx` only after ordinary membership in the Hub-resolved current Room is verified; also used by `bot-workload-panel.tsx` and, best-effort, `ai-chat-panel.tsx` to offer the installation bot as an AI Chat agent option. | Current-Room bot identity is unavailable. |
| `lists:read` | Required | Room; user | Reads HR lists, fields, stages, and items in `contact-collector-form.tsx` and `list-items-table.tsx`. | Installation is cancelled if rejected. |
| `lists:write` | Optional | Room; user | Creates and edits HR lists, fields, and records in the Records panel. | Records remain readable; create/edit/delete controls are disabled. |
| `files:read` | Optional | Room; user | Lists and previews room files in `file-upload-panel.tsx`. | The Files panel is hidden with an explanation. |
| `files:write` | Optional | Room; user | Uploads files via `app.uploadFile()` in `file-upload-panel.tsx` and record file fields. | Upload buttons and file fields are disabled. |
| `sandbox:skills:use` | Optional | Room; user | Lists and synchronizes room sandbox skills in `skills-panel.tsx`. | Skill controls are hidden. |
| `sandbox:generate` | Optional | Room; user | Starts and polls a Sandbox attempt in `bot-workload-attempt-section.tsx`, optionally selecting the installation-owned agent bot as executor via `botId` (never a `projectId`). | The Bot workload tab cannot start or poll a Sandbox attempt. |
| `sandbox:botkey:push` | Optional | Room; user | Reads bot-key status and performs an explicit push in `sandbox-connect-panel.tsx`. | Sandbox connection controls are hidden. |
| `sandbox:wake` | Optional | Room; user | Wakes and polls the room sandbox in `sandbox-connect-panel.tsx`. | Wake is disabled while other granted sandbox controls remain usable. |
| `sandbox:ai-chat` | Optional | Room; user | Reads sessions/history in `ai-chat-panel.tsx`, `ai-poem-panel.tsx`, and `ai-history-panel.tsx`. | Existing AI sessions are not displayed. |
| `sandbox:ai-chat:write` | Optional | Room; user | Starts, sends, cancels, and generates AI work in the chat and poem panels. | Creation/generation panels are disabled; separately granted read history remains available. |

The app-owned `hr_bulk_export` tool does not request a workspace permission. It processes caller
input and is gated by the Pro license feature. The Hub still enforces installation status, receipt,
epoch, target room, exact grant, and current-user ACL on every mediated platform operation.
