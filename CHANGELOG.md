# Changelog

This project follows [Semantic Versioning](https://semver.org/). Each marketplace listing version
must equal `privos-app.json.version` and `package.json.version`; change both release notes and metadata
in one commit.

## [2.10.0] - 2026-08-12

### Fixed

- **An admin-approved provider embed now actually renders.** The Embeds panel asked for the
  provider through `useProviderEmbed` (`@privos_ai/app-react` 0.4.0) instead of iframing it
  itself: the app document is sandboxed without `allow-same-origin`, so every iframe it
  creates inherits an opaque origin and YouTube refuses to initialize in it — approval alone
  left an empty box. The host validates the URL's origin against the admin-approved list and
  renders the frame outside this sandbox, over a placeholder the app owns.

### Changed

- The panel keeps a self-framed copy of the same approved provider next to the hosted one, so
  the difference the hoisted path exists for is visible rather than described, and states the
  host's decision (`requesting` / `granted` / `denied` + reason / `unsupported`) in words.
- `@privos_ai/app-react` dev dependency `^0.3.0` → `^0.4.0`.

## [2.9.0] - 2026-08-12

### Changed

- The records table pages and searches server-side through the Hub's
  `items.query` API instead of reading a whole list into the browser. It takes a
  window of twenty rows, fetches the next window by cursor, filters on the
  server, and refreshes incrementally by asking only for what changed since the
  last load and merging by id.
- `lists:query` is declared as an OPTIONAL permission: an installation that has
  not granted it keeps working through the previous route, which now answers
  with at most 500 items — and the table says so rather than showing a silent
  subset.

### Fixed

- `package-lock.json` claimed `2.5.0` while the app declared `2.9.0`, and it
  carried two extraneous `../` links to a locally checked-out React SDK. The
  publication build runs `npm ci` against that file. No resolved dependency
  version changed.

## [2.8.0] - 2026-08-11

### Added

- A "Validate credential" button on the Bot workload tab that proves the
  configured agent bot credential actually works, instead of only explaining
  where it comes from. Backend tool `hr_agent_bot_credential_check` calls the
  Hub's own `GET /api/v1/me` with `PRIVOS_AGENT_BOT_CREDENTIAL` +
  `PRIVOS_AGENT_BOT_USER_ID` as the `x-user-id`/`x-auth-token` header pair
  Hub REST authentication expects, bounded by a 5s timeout. The UI
  distinguishes `not-configured` (either env var absent), `invalid` (Hub
  rejected them — most likely cause named explicitly: an admin re-issued the
  credential and this container still holds the old, dead value until the
  configuration is applied and the container recreated), `hub-unreachable`
  (Hub origin unresolved or the request itself failed/timed out — distinct
  from an explicit rejection), and `valid` (shows the bot's own `_id`/
  `username` as proof). The credential value itself is never returned,
  logged, or thrown.
- Declared the reserved env key `PRIVOS_AGENT_BOT_USER_ID` (not secret),
  paired with the existing `PRIVOS_AGENT_BOT_CREDENTIAL` for Hub REST
  authentication.

## [2.7.0] - 2026-08-11

### Changed

- Removed frontend issuance of the installation agent bot's Hub credential
  from the Bot workload tab: the `mcpapp.bot.issueCredential` call, its
  `BOT_CREDENTIAL_ISSUE_DENIED`/`BOT_CREDENTIAL_ISSUE_DISABLED` error mapping,
  and the `bot:credential:issue` optional permission are all gone. That tool
  and scope are being removed from the Hub catalog — no app calls them any
  more. Issuance now happens only in the Hub's own Admin > Apps > this app >
  Settings, performed manually by a workspace admin; the tab explains this in
  place of the old button.
- Declared the reserved secret env var `PRIVOS_AGENT_BOT_CREDENTIAL`. The
  backend (`mcp-message-handlers.ts`) reports whether it is configured
  (`agentBotCredentialSet`, never the value) alongside the existing SMTP
  secret check, demonstrating the correct consumption side: read from the
  app's own environment, never received from a frontend call.

## [2.6.0] - 2026-08-11

### Added

- A Bot workload demo tab covering the installation agent bot's full
  execution lifecycle: create the bot, join the current Room, issue its Hub
  credential, then pick it (or the Room default bot) as the executor on
  `agents.sandbox.generate-async`, poll the attempt, and see how a raised
  question surfaces as a Room thread message that only a Room OWNER can
  answer — `agents.sandbox.answer` is deliberately not exposed to apps, so
  the panel only ever tells you to go look. The issued credential is never
  rendered, logged, or persisted; the panel explains it belongs in the app
  backend, not a browser.
- An executor selector on the AI Chat tab. It also documents, and lets an
  operator see for themselves, that an installation-owned agent bot can run
  as a Sandbox executor but currently cannot be an AI Chat agent —
  `ai-messages.send` resolves the agent's token from a `BotTokens` row, which
  installation-owned bots don't have.
- Optional approval declarations for `bot:credential:issue` and
  `sandbox:generate`, each with independent degraded behavior.

### Changed

- `restCall` now surfaces the Hub's actual REST failure reason (`body.error`)
  instead of a bare status code, so distinct failure modes — an unprovisioned
  executor bot vs. a task already bound to a different one — are
  distinguishable in the UI.

## [2.5.0] - 2026-08-09

### Added

- An Embeds demo tab showing how the workspace's external-embed allowlist behaves. The app
  declares `https://www.youtube.com` under `tools[].ui.csp['frame-src']`; the tab renders that
  declared provider next to an origin it never declared, and lists whatever the browser refuses,
  so an operator can see that a declaration is a request and the administrator's approval is what
  is enforced.
- An Agent bot demo tab that creates one bot owned by the exact app installation, explicitly joins
  it to the Hub-authorized current Room, and reads only its safe current-Room identity. The Room
  actions expose no Room, bot, token, or secret selector.
- Optional approval declarations for `bot:agent:create`, `bot:room:join`, and
  `bot:identity:read`, each with independent degraded behavior.

## [2.2.0] - 2026-08-05

### Added

- An app-owned AI chat panel. The app tells the Hub it renders its own chat
  window, so the Hub's floating launcher opens this panel instead of the Hub's
  own chat and hides itself while the panel is open; minimizing hands the
  launcher back. Publishers who ship their own chat design can copy
  `src/ui/app-owned-chat-panel.tsx` as the reference implementation.

### Changed

- Both PrivOS SDKs now install from the npm registry (`@privos_ai/app-server`
  ^0.3.1, `@privos_ai/app-react` ^0.3.0) instead of tarballs and a hand-copied
  React SDK under `vendor/`. Publishers cloning this reference no longer inherit
  local-path dependencies that a marketplace submission cannot resolve.

### Requires

- A Hub that answers the `host/chat.register` bridge handshake. On an older Hub
  the panel reports the surface as unsupported and the app falls back to its own
  entry point, so the app stays functional.

## [2.1.1] - 2026-08-04

### Fixed

- The app now pairs when PrivOS runs it as an App Library generation. A node
  running a generation attests the generation rather than a standalone replica,
  and the previous runtime SDK rejected that attestation outright, so `/ready`
  stayed 503 with `BROKER_RESPONSE_INVALID` and every tool call was refused.
- Tool calls the Hub routes through a cluster are now verified against the
  attested generation. That assertion carries generation affinity, which
  neither dispatch verifier in the previous SDK accepted.

### Changed

- Runtime SDK `@privos_ai/app-server` 0.2.1 → 0.3.1.
- A dispatch verified through the cluster reports no actor: the Hub authorizes
  the call without naming the caller, so `whoami` returns no subject there.

## [2.1.0] - 2026-08-04

### Changed

- Declared the schema-v3 lifecycle manifest, including an empty
  `resourceManifestTemplate`: this app is stateless and owns no publisher
  resource outside the platform-managed ones the control plane injects.
- The manifest lint, preflight and runtime readiness checks now accept every
  supported schema version instead of pinning to v2.

### Notes

- The `roomId` argument of `hr_management_dashboard` is a runtime tool
  parameter. Installation stays roomless; a room is chosen later, per room.

## [2.0.0] - 2026-08-02

### Changed

- Replaced browser bearer tokens with capability-aware host calls and a
  secretless workload identity derived from the app-cluster broker.
- Adopted the strict schema-v2 permission contract and private, body-bound MCP
  dispatch protocol. This is intentionally not compatible with v1 runtimes.

### Security

- The production image now carries the canonical reviewed manifest as an OCI
  configuration label; Marketplace release approval remains a detached,
  digest-bound control-plane attestation.

## [1.0.0] - 2026-08-02

### Added

- Deterministic, secret-safe source archive and SHA-256 provenance output.
- Self-contained vendored React SDK for isolated platform builds.
- Direct HTTP and local relay transports over one MCP handler set.
- Non-root, read-only-compatible multi-stage container.
- Canonical root `privos-app.json`, scope justifications and Free/Pro license example.
- Preflight, Vitest coverage, GitHub Actions and hardened container smoke test.
- Publisher walkthrough and complete listing launch kit.
- App-specific Marketplace privacy notice and terms of use.

### Changed

- Repository/package identity is `privos-mcp-app-demo` / `ai.privos.mcp-app-demo` and the app title is
  `PrivOS Demo MCP App`.
- Scope inventory was audited against real REST call sites. All ten scopes remain because every one
  is exercised; no unused scope survived the audit.

### Security

- Credential backups, recycle-bin state, build output and local dependencies are excluded from source
  archives and Docker contexts.
- The production image removes the unused npm/npx package-management toolchain and its transitive
  attack surface after the build stage.
