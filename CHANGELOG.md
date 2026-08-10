# Changelog

This project follows [Semantic Versioning](https://semver.org/). Each marketplace listing version
must equal `privos-app.json.version` and `package.json.version`; change both release notes and metadata
in one commit.

## [2.4.1] - 2026-08-10

### Added

- An Embeds demo tab showing how the workspace's external-embed allowlist behaves. The app
  declares `https://www.youtube.com` under `tools[].ui.csp['frame-src']`; the tab renders that
  declared provider next to an origin it never declared, and lists whatever the browser refuses,
  so an operator can see that a declaration is a request and the administrator's approval is what
  is enforced. No new permission scope is requested.

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
