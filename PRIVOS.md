# CLAUDE.md

## Project

Marketplace-ready reference PrivOS MCP app. Node.js 22 + TypeScript + React/Vite. Direct HTTP is the
deployment default; relay WebSocket is for local development. Both use
`src/mcp-message-handlers.ts`.

## Commands

- `npm ci` — install from lockfile; the app-react SDK is vendored under `vendor/`.
- `npm run dev` — relay transport with live Vite UI.
- `npm run build` — build UI and generate `dist/manifest.json`.
- `npm run typecheck && npm test && npm run preflight` — required verification.
- `npm run package` — deterministic tracked-source archive; requires a clean tree.
- `npm run docker:build` — isolated marketplace image build.

## Invariants

- `package.json` is authoritative for parser-supported manifest metadata.
- Do not add manifest fields outside `HUB_MANIFEST_FIELDS` without hub parser support.
- Every declared scope needs a real annotated call site and a `SCOPES.md` justification.
- License lapse degrades to Free and never destroys data.
- Never package or build from a working-tree sweep; never commit secrets.
