# PrivOS reference MCP app

This repository is the copyable, marketplace-ready example of a PrivOS MCP app. It shows one
transport-neutral JSON-RPC handler set, a React MCP App UI, minimum justified workspace scopes,
free/Pro license behavior, safe source packaging, local preflight, and a hardened container build.

An installed app runs as a cluster-hosted container inside the buyer's workspace. The hub mediates
MCP calls and workspace REST access, and the buyer consents to the scopes in [SCOPES.md](SCOPES.md).

## 1. Clone and run locally

Requirements: Node.js 22+, npm, Git and Docker.

```bash
git clone https://github.com/PrivOS-AI/privos-demo-hrm-ws
cd privos-demo-hrm-ws
npm ci
cp .env.example .env
npm run dev
```

Development uses `PRIVOS_TRANSPORT=relay`: the app dials the hub over WebSocket, so no public app
server is required. On first run, obtain a pairing URL from PrivOS Admin → Apps → Register Relay App
and paste it into the prompt. Credentials are stored only in ignored `.env`.

The Vite UI defaults to `http://localhost:5179`. Set `DEV_TUNNEL=cloudflared` only when the browser
displaying the hub is on another machine.

## 2. Run the marketplace transport

The marketplace deploys `direct` transport, which is the default:

```bash
npm run build
PORT=3000 npm start
curl http://127.0.0.1:3000/.well-known/mcp/manifest.json
curl --json '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  http://127.0.0.1:3000/mcp
```

Both transports call the same handlers in `src/mcp-message-handlers.ts`. A relay server has no
per-request user identity; use direct mode and verify the hub-signed user token when backend logic
must identify the caller.

## 3. Build the exact marketplace container

```bash
npm run docker:build
npm run docker:run
```

The multi-stage image builds without sibling repositories, runs as the unprivileged `node` user, and
works with a read-only root filesystem, all Linux capabilities dropped, no-new-privileges and a
100-process limit. The platform injects `PORT`, `PRIVOS_TRANSPORT=direct`,
`PRIVOS_APP_LICENSE`, and `PRIVOS_WORKSPACE_ID`.

## 4. Choose and justify scopes

Start with no scopes, add one only when a real call needs it, and write the reviewer-facing reason at
the same time. [SCOPES.md](SCOPES.md) maps every requested scope to an actual panel and API call.
Preflight fails if a declared scope lacks both documentation and an annotated call site.

## 5. Define pricing and license behavior

`package.json` is the single metadata source. Its `license.tiers` declares:

- Free: 50 records.
- Pro: 5,000 records plus `bulk-export`.

The server guards the tool with `license.assert('bulk-export')` and
`assertWithin('records', count)`. The License UI hides the Pro action on Free. A lapsed Pro license
degrades to Free without deleting or mutating records. Until `@privos/app-license` is published,
`src/license.ts` is a compatibility shim with the intended API surface.

For local testing:

```bash
PRIVOS_APP_LICENSE='{"tier":"pro","state":"active"}' npm start
```

## 6. Check the submission

```bash
npm run typecheck
npm test
npm run preflight
```

Preflight checks the authoritative manifest, supported fields, scopes, Dockerfile, license guards,
packaging policy, and the live manifest endpoint. Its rules are explicitly versioned as a temporary
mirror until the portal's shared marketplace validation module is published. Failures include a
specific fix.

## 7. Package source safely

Commit the exact source you intend to submit, then run:

```bash
npm run package
```

This creates `dist-source/ai.privos.demo-hr-management-ws-1.0.0.tar.gz` and a `.sha256` provenance
file. It packages Git-tracked files, never sweeps the working directory, rejects dirty trees,
credential-like files, build output and archives over 200 MiB. `--allow-dirty` exists for local
inspection only.

Never zip or tar the whole working directory. `.env`, backups, credentials, `node_modules`, `dist`
and editor/agent state must not enter a submission.

## 8. Submit and review

Upload the archive, its checksum, listing copy, assets and `dockerfilePath: Dockerfile`. Review checks
that the image builds from the archive, the manifest endpoint answers, requested scopes match code,
license claims are enforced, no secrets are present, and the app behaves under hardened runtime
flags. Typical rejection causes are sibling path dependencies, unjustified scopes, missing
Dockerfiles, unsupported manifest keys and hidden credentials.

### What happens to submitted source

Marketplace behavior recorded in the authoritative marketplace plan on 2026-07-26: source is used
only to review and build the app and is not shared with buyers. It is encrypted at rest, access is
audited, and it is retained while a version is published so PrivOS can rebuild for base-image CVEs.
After all versions are unpublished, the publisher can request deletion. Agent content is different:
agents are installed into the buyer's workspace and are readable there; MCP app source remains
confidential.

This example is MIT-licensed so publishers can copy it. Marketplace apps do not have to be open
source; publishers may choose their own license while still providing reviewable source privately.

## 9. Release and update

Follow [CHANGELOG.md](CHANGELOG.md) and SemVer. A marketplace listing version maps to the same
`package.json` version. After approval the platform builds and digest-pins the image. Existing buyers
remain on their installed digest until they opt into an update.

## 10. Launch

The [launch kit](launch-kit/README.md) includes listing copy, scope text, icon variants, screenshots,
an OG image and a demo storyboard. Affiliate links may append publisher-issued SubIDs so campaign
attribution stays separate without changing the listing identity.

## Configuration

See [.env.example](.env.example). No secret belongs in Git. Architecture and maintainer commands are
summarized in [PRIVOS.md](PRIVOS.md).
