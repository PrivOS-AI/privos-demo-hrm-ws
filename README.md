# PrivOS Demo MCP App

This is the reference schema-v2 PrivOS MCP app. It demonstrates exact required and optional
permissions, safe feature degradation, secretless workload identity, authenticated private Hub
dispatch, the iframe host bridge, license-aware behavior, and reproducible Marketplace packaging.

## Runtime trust model

Managed production installations do not use a pair URL, OAuth client secret, or browser user
token. App Cluster mounts a per-installation Unix socket. `@privos_ai/app-server` creates an
ephemeral P-256 DPoP key in memory, obtains short-lived sender-constrained workload tokens through
the socket, and refreshes them without writing credentials to disk or environment variables.

Hub-to-app `/mcp` requests travel through private Cluster dispatch and carry a short-lived signed
assertion bound to the request body, installation, replica, receipt hash, and permission epoch.
The backend actor for `hr_whoami` comes from that verified assertion. The iframe receives only
non-secret host context and uses `app.rest()`, `app.uploadFile()`, and MCP tools through the Hub
bridge as the current user.

Production accepts these non-secret values from the platform:

- `PRIVOS_HUB_ORIGIN`
- `PRIVOS_APP_ID`
- `PRIVOS_INSTALLATION_ID`
- `PRIVOS_WORKLOAD_SOCKET` (normally `/run/privos/identity.sock`)

## Local development

Requirements: Node.js 22+, npm, Git, and Docker.

```bash
git clone https://github.com/PrivOS-AI/privos-mcp-app-demo
cd privos-mcp-app-demo
npm ci
cp .env.example .env
npm run dev
```

`npm run dev` explicitly enables the legacy relay pairing path for local development. Obtain a
pairing URL from PrivOS Admin and paste it into the prompt. Ignored `.env` storage and OAuth client
credentials are permitted only in this mode; the relay client refuses them when
`NODE_ENV=production` or `PRIVOS_RUNTIME_MODE` is not `development`.

The Vite UI defaults to `http://localhost:5179`. `DEV_TUNNEL=cloudflared` is optional when the
browser displaying Hub is on another machine.

## Managed direct runtime

The Marketplace image starts direct transport by default:

```bash
npm run build
PRIVOS_RUNTIME_MODE=development PORT=3000 npm start
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/ready
curl http://127.0.0.1:3000/.well-known/mcp/manifest.json
```

Development compatibility reports manifest-verified readiness without a broker. In production,
`/health` only proves the process is alive; `/ready` returns 200 only after the manifest is valid,
workload identity is paired, and the current receipt/epoch is active. A public or unsigned
production `POST /mcp` returns 403.

## Permission contract

[`privos-app.json`](privos-app.json) is the canonical reviewed manifest. Each permission declares:

- required or optional;
- workspace/room context and user/background execution context;
- a stable feature identifier and publisher reason;
- deterministic degraded behavior for every optional permission.

Required permissions are locked during approval. Optional permissions start from the exact
approved subset and may be disabled later; Hub enforces the new epoch immediately. UI capability
checks only hide or explain features and are never the authorization boundary. See
[`SCOPES.md`](SCOPES.md) for the declaration-to-call-site map.

Run the shared linter to print the deterministic canonical manifest and publisher permission hashes:

```bash
npm run manifest:lint
```

Portal and Hub add the versioned authoritative permission catalog, data policy, and immutable image
digest when computing the final permission-contract hash.

## Installation-owned agent bot demo

The **Agent bot** tab demonstrates the split approval model for an app-owned execution identity:
workspace approval creates one bot for the exact parent installation, while separate Room approvals
allow joining that bot and reading its safe identity in the current Room. The Room actions accept no
Room, bot, or token selector; the Hub derives authority from the verified invocation and active Room
binding. Bot-key provisioning remains a separate Sandbox operation.

See [`src/ui/agent-bot-panel.tsx`](src/ui/agent-bot-panel.tsx) for the three tool calls,
[`privos-app.json`](privos-app.json) for their permission declarations, and
[`SCOPES.md`](SCOPES.md) for the approval rationale and degraded behavior.

## Isolated list, multi-user assignment demo

The **Isolated ASSIGNEE** tab demonstrates assigning several users at once to an item on an
isolated list. The field type that controls who can see an item is **`ASSIGNEE`**
(`apps/meteor/server/core-typings/IList.ts` in the Hub) — some older docs name `USER_SELECT` or
`MEMBER_SELECT` instead, but neither field type exists in the Hub; using either name will not
create a working assignment field. One `ASSIGNEE` field accepts a bare user-id string, a `{ _id }`
object, or an **array** of either, so a single field can hold several assignees
(`getAssignedUserIds`, `apps/meteor/app/api/server/lib/isolated-list-item-filter.ts:23-41`).

For an isolated list, the Hub shows an item only to the room owner/admin, the item's creator, and
whoever is listed in its `ASSIGNEE` field(s) (same file, the visibility check that consumes
`getAssignedUserIds`) — nobody else in the room. The demo runs, in order: `mcpapp.lists.create`
(`isolatedList: true`, caller must be room owner/admin) → `mcpapp.lists.addField` (type
`ASSIGNEE`) → `mcpapp.lists.createItem` → `mcpapp.lists.updateCustomField` (writes an array of
user ids) → `mcpapp.lists.getItems` (reads the item back and confirms every assigned id was
stored, not just the first one). See [`src/ui/assignee-demo-panel.tsx`](src/ui/assignee-demo-panel.tsx)
for the calls and [`src/ui/assignee-demo-helpers.ts`](src/ui/assignee-demo-helpers.ts) for the
pure id-list parsing tested in [`tests/assignee-demo-helpers.spec.ts`](tests/assignee-demo-helpers.spec.ts).

Scope: only the already-declared `lists:write` (optional, room owner/admin for the isolated-list
create step) and `lists:read` (required) — no new permission is requested.

**Argument shapes — checked against the Hub's own tool schemas** in
`apps/meteor/server/services/mcp-tool-handlers-lists.ts`:

| Tool | Arguments |
|------|-----------|
| `mcpapp.lists.create` | `roomId`, `name`, `key?`, `description?`, `isolatedList?`, `fieldDefinitions[]`, `stages[]` |
| `mcpapp.lists.addField` | `listId`, `name`, `type`, `fieldId?` |
| `mcpapp.lists.createItem` | `listId`, **`title`** (not `name`), `description?`, `customFields[]`, `stageId?` |
| `mcpapp.lists.updateCustomField` | `itemId`, `fieldId`, `value` |
| `mcpapp.lists.getItems` | `listId`, `offset?`, `count?`, `sortBy?`, `sortOrder?`, `stageId?`, `customFieldFilters[]?` |

The shapes come from the schema definitions; the end-to-end flow itself has **not** been run
against a live Hub (this sandbox has none), so treat the response shapes — as opposed to the
request shapes — as the part still worth confirming on a real installation.

**Verify isolation with two accounts** (manual, needs a real Hub installation):

1. As account A (room owner/admin), open this app in a Room and run the demo on the **Isolated
   ASSIGNEE** tab, entering account A's and account B's user ids (each account's id is shown on
   its own **Identity** tab).
2. As account B, open the same list. The item should be visible — B is an assignee.
3. As account C, a third room member who is not the room owner/admin, not the item's creator, and
   not listed in the ASSIGNEE field, open the same list. The item should **not** be visible.
4. Re-run `mcpapp.lists.updateCustomField` to remove C from nobody's assignment (or add C), and
   confirm C's visibility flips accordingly — this is what proves the ASSIGNEE field, not room
   membership, gates isolated-list item visibility.

## License behavior

The manifest declares a Free tier (50 records) and Pro tier (5,000 records plus `bulk-export`).
The backend calls `license.assert('bulk-export')` and `assertWithin('records', count)`. A lapsed Pro
license degrades to Free without deleting records.

Local Pro test:

```bash
PRIVOS_RUNTIME_MODE=development PRIVOS_APP_LICENSE='{"tier":"pro","state":"active"}' npm start
```

## Verification

```bash
npm run typecheck
npm test
npm run build
npm run preflight
npm run docker:build
```

Preflight validates schema v2, canonical hashes, documented call sites, Docker inputs, license
guards, safe source packaging, and the served manifest. Its versioned rules mirror Portal until the
Marketplace validation package is published.

## Safe source packaging

```bash
npm run package
```

This creates `dist-source/ai.privos.mcp-app-demo-2.0.0.zip` plus a SHA-256 provenance file from
Git-tracked source. It rejects dirty trees by default, credential-like files, `.env`, dependencies,
build output, and archives over 200 MiB. `--allow-dirty` is for local inspection only.

The multi-stage image installs only lockfile-pinned package inputs, runs as `node`, supports a
read-only root filesystem, and needs no production credential environment variables.

## Environment configuration

`privos-app.json` declares the values an operator supplies from Hub **Admin → Apps → Settings →
Environment**. The declaration is part of the digest-pinned manifest, so it is fixed per published
version; the Portal validates it at submission and the reviewer sees every secret the app asks for.

| Key | Required | Secret | Purpose |
|-----|----------|--------|---------|
| `HRM_COMPANY_NAME` | yes | no | Company name in the dashboard header. |
| `HRM_LOCALE` | no | no | BCP-47 locale for dates and currency; the app defaults to `en-US`. |
| `HRM_SMTP_PASSWORD` | no | **yes** | SMTP password for payslip mail. |

Two rules this app demonstrates, and every publisher should follow:

- **A required value never blocks installation.** The operator fills it in afterwards, so the app
  must start and report its own unconfigured state. `hr_whoami` returns `companyName: null` rather
  than refusing to run.
- **A secret is reported, never printed.** `hr_whoami` returns `smtpPasswordSet: true|false`. The
  value would otherwise travel through a room, which is precisely what the platform's write-only
  storage exists to prevent.

Applying values restarts the app container. The environment is read at start like any process
environment; there is no runtime config-fetch API.

### Variables the platform injects

`hr_whoami` also echoes what PrivOS injects, read through the SDK's `getPlatformContext()`:

```ts
import { getPlatformContext, publicUrlFor } from '@privos_ai/app-server';

const { publicUrl, accessMode } = getPlatformContext();
const iconUrl = publicUrlFor('/public/icon.svg');
```

`PRIVOS_PUBLIC_URL` is this app's own public origin and `PRIVOS_ACCESS_MODE` is `managed-runtime`
or `publisher-hosted`. Tool calls and interface requests do **not** arrive on the public origin —
those ride the signed broker dispatch on `/mcp`. Use it for public static media, webhook callbacks,
and OAuth redirect URIs. Both helpers are undefined-safe, so the app still runs where nothing is
injected.

## Privacy, support, and release

Marketplace review/build source remains publisher-confidential; buyer workspaces receive the
digest-pinned image. See [`PRIVACY.md`](PRIVACY.md), [`TERMS.md`](TERMS.md), and
[`CHANGELOG.md`](CHANGELOG.md). Support is available through GitHub Issues or `dev@privos.ai`.
