# Scope justifications

This app requests only scopes exercised by the shipped UI. Reviewers can map every scope below to
the named call sites.

| Scope | Why it is required |
|---|---|
| `basic:information` | Reads the current room, app and deep-link identifiers in `info-panel.tsx`. |
| `lists:read` | Lists HR lists, fields, stages and records in `contact-collector-form.tsx` and `list-items-table.tsx`. |
| `lists:write` | Creates and edits the demo HR list, fields and records in the records panel. |
| `files:read` | Lists and downloads room files in `file-upload-panel.tsx`. |
| `files:write` | Uploads a selected file through the host file bridge in `file-upload-panel.tsx`. |
| `sandbox:skills:use` | Lists and synchronizes selected workspace skills in `skills-panel.tsx`. |
| `sandbox:botkey:push` | Reads bot-key status and explicitly pushes the key in `sandbox-connect-panel.tsx`. |
| `sandbox:wake` | Wakes an idle sandbox and polls its VM state in `sandbox-connect-panel.tsx`. |
| `sandbox:ai-chat` | Reads AI sessions and generated messages in the chat, poem and history panels. |
| `sandbox:ai-chat:write` | Sends, starts and cancels AI generations in the chat and poem panels. |

No scope is requested for the app-owned `hr_bulk_export` tool: that operation processes input passed
to the app and is gated by its Pro license feature rather than a workspace REST permission.
