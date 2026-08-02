# CLAUDE.md

## Project

Marketplace-ready reference PrivOS MCP app. Node.js 22 + TypeScript + React/Vite. Direct HTTP is the
deployment default; relay WebSocket is for local development. Both use
`src/mcp-message-handlers.ts`.

## Commands

- `npm ci` — install from lockfile; the app-react SDK is vendored under `vendor/`.
- `npm run dev` — relay transport with live Vite UI.
- `npm run build` — build UI, generate `dist/manifest.json`, validate schema v2, and print canonical hashes.
- `npm run typecheck && npm test && npm run preflight` — required verification.
- `npm run package` — deterministic tracked-source archive; requires a clean tree.
- `npm run docker:build` — isolated marketplace image build.

## Invariants

- `privos-app.json` is the canonical Marketplace/runtime manifest; package identity fields mirror it.
- Do not add manifest fields outside `MARKETPLACE_MANIFEST_FIELDS` without Portal parser support.
- Every declared permission needs a real annotated call site and a `SCOPES.md` justification; every optional permission needs safe degraded behavior.
- Production uses the workload broker/DPoP SDK and signed private dispatch. Legacy relay credentials are development-only.
- The iframe never receives a Hub bearer/user token; backend actor identity comes from the verified dispatch assertion.
- License lapse degrades to Free and never destroys data.
- Never package or build from a working-tree sweep; never commit secrets.
