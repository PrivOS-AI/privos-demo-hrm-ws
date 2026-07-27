# Demo HR Management

**Tagline:** A complete, copyable PrivOS MCP app—from first workspace call to licensed Pro export.

**Short description:** Explore HR records, files, AI workflows and sandbox controls in a
marketplace-ready reference app with minimum justified permissions.

## Long description

Demo HR Management is both a useful workspace demo and the canonical reference for building a PrivOS
MCP app. Browse and edit structured HR records, work with room files, run AI chat and poem workflows,
inspect verified identity, synchronize skills and wake the workspace sandbox.

The app demonstrates the production contracts publishers need: hub-mediated workspace access,
explicit scope consent, direct container transport, a relay development loop, hardened deployment,
and license-aware features. Free supports up to 50 records. Pro raises the limit to 5,000 and unlocks
bulk export. If Pro lapses, the app safely returns to Free behavior without deleting existing data.

**Category:** Productivity / Developer tools

**Keywords:** HR, records, MCP, reference app, AI, sandbox, PrivOS

## Reviewer notes

The source is intentionally MIT-licensed and self-contained. `SCOPES.md` contains one justification
per requested scope and maps each to a concrete UI call site. The Pro `bulk-export` tool and Free/Pro
record limits are enforced server-side; the UI also hides the unavailable Pro action.

## Scope justification copy

Use the exact table in `../SCOPES.md` for submission. No requested permission is used for analytics,
advertising, background collection or access outside the active workspace.
