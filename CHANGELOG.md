# Changelog

This project follows [Semantic Versioning](https://semver.org/). Each marketplace listing version
must equal `privos-app.json.version` and `package.json.version`; change both release notes and metadata
in one commit.

## [1.0.0] - 2026-08-02

### Added

- Deterministic, secret-safe source archive and SHA-256 provenance output.
- Self-contained vendored React SDK for isolated platform builds.
- Direct HTTP and local relay transports over one MCP handler set.
- Non-root, read-only-compatible multi-stage container.
- Canonical root `privos-app.json`, scope justifications and Free/Pro license example.
- Preflight, Vitest coverage, GitHub Actions and hardened container smoke test.
- Publisher walkthrough and complete listing launch kit.

### Changed

- Repository/package identity is `privos-mcp-app-demo` / `ai.privos.mcp-app-demo` and the app title is
  `PrivOS Demo MCP App`.
- Scope inventory was audited against real REST call sites. All ten scopes remain because every one
  is exercised; no unused scope survived the audit.

### Security

- Credential backups, recycle-bin state, build output and local dependencies are excluded from source
  archives and Docker contexts.
