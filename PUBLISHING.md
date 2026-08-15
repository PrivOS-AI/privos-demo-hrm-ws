# Packaging and publishing this app to the PrivOS marketplace

The process, in order, with the checks that actually reject a submission. Every
rule below is enforced by the Portal, not by convention — the error codes are
the ones it returns.

Publisher API base: `https://portal.privos.io/api/cloud/marketplace`.

---

## 0. Before you package

You need a **creator enrolment** (a `MarketplaceCreator` record) on the account
that will own the listing, and a cloud publisher session to call the API with.
A listing you do not own cannot be updated.

Decide the version first. `privos-app.json:version`, `package.json:version`, and
the `semver` you post when creating the version must all be the same string, or
version creation is refused.

---

## 1. Regenerate and lint the manifest

```bash
npm run build          # vite build + generate-manifest.ts + manifest:lint
npm run manifest:lint  # privos-app-lint privos-app.json
```

`manifest:lint` prints the two pins you will need later:

- `canonicalManifestHash` — sha256 over the **whole** manifest serialized with
  every object key sorted recursively. The Hub recomputes it at install time and
  refuses a mismatch, and the built image must carry it as the label
  `io.privos.manifestDigest`.
- `publisherPermissionDeclarationHash`.

### Check the permission catalog before anything else

Every declared permission is validated against the Portal's catalog
(`marketplace-mcp-permission-catalog.ts`). Three ways it rejects:

| Error | Meaning |
|---|---|
| `PROPOSAL_PERMISSION_UNKNOWN` | the scope is not in the catalog (or has been retired) |
| `PROPOSAL_PERMISSION_CONTEXT_INVALID` | scope declared in a `context` it does not allow |
| `PROPOSAL_PERMISSION_EXECUTION_INVALID` | scope declared for an `executionContext` it does not allow |

A retired scope is the expensive one: it fails **new** submissions while every
already-installed copy keeps working, so nothing in the running fleet warns you.
`bot:agent:create` was retired when creating the installation bot became an
administrator's action taken under the manifest's own `agentBot` declaration.

If a release needs a scope the deployed Portal does not know yet, the Portal
must gain it and be redeployed **first**. Otherwise cut the release from the
last published commit and cherry-pick, so the reviewed permission set is
unchanged.

---

## 2. Run the local mirror of the Portal's rules

```bash
npm run preflight
```

This mirrors the marketplace checks that are cheap to run locally — manifest
field set, identity fields agreeing with `package.json`, and the lockfile
version matching the app version. The build node runs `npm ci` against the
committed lockfile, so a stale lock is a broken publication waiting to happen.

Then the real gates:

```bash
npm run typecheck && npm test && npm run docker:build
```

---

## 3. Package the source archive

```bash
npm run package        # or: npm run package -- --allow-dirty
```

`scripts/package-source.sh` refuses a dirty tree, scans the worktree for
credential-like files, builds the zip with `git archive`, re-inspects the
archive entries, enforces the 200 MB limit, and writes `<archive>.sha256`.

What the archive **must** contain, at the root:

- `privos-app.json` — otherwise `manifest_missing`
- `Dockerfile` — otherwise `dockerfile_missing`

What it must **not** contain, each rejected as `denied_path`:

- `.git/`, `node_modules/`, `.privos/skills/`, any `..` traversal
- any `.env*` path — the rule is `(^|/)\.env(\.|$)`, so **`.env.example`
  counts**

Exclusion is handled by `.gitattributes` `export-ignore` entries, which is why
`git archive` drops `.env.example` and the agent-context files. Add a new
entry there rather than deleting files from the zip by hand.

Other archive limits: `.zip` only, 1 byte – 200 MB, ≤ 20,000 entries, ≤ 50 MB
per file.

Record three pins for the release: the **full 40-character git revision**, the
**archive sha256**, and the **canonical manifest hash**.

---

## 4. Upload, create the version, submit

Multipart, in 5 MB parts. The upload session **expires 24 hours** after it is
opened, and each part call requires it to still be `OPEN`.

| Step | Call |
|---|---|
| 1 | `POST /creator/listings/:id/uploads` — `{ fileName, totalBytes, kind: "APP_SOURCE" }` → returns `uploadId`, `partSizeBytes`, `expiresAt` |
| 2 | `PUT /creator/uploads/:uploadId/parts/:partNumber` — `{ dataBase64 }`, repeated per part |
| 3 | `POST /creator/uploads/:uploadId/complete` — validates archive policy, extracts the manifest, returns `sha256` (compare it against your pin) |
| 4 | `POST /creator/listings/:id/versions` — `{ semver, uploadId, changelog? }` |
| 5 | `POST /creator/listings/:id/submit` — enters the review pipeline |

An upload can be claimed by exactly one version. Submitting requires the
listing to have `latestVersionId` and `primaryCategoryId` set.

Sessions are short-lived relative to a large upload, so drive this with a
**resumable script**, not by hand.

---

## 5. The review pipeline

```
UPLOADED → PREFLIGHT_PENDING → SCANNING → SCANNED_PENDING_AI
        → READY_FOR_REVIEW → APPROVED_BUILD_PENDING → PUBLISHED
```

Automatic: preflight, security scan, and the AI review — which is **advisory**
and routinely returns a flag without blocking. If the AI reviewer is
unavailable the version still reaches `READY_FOR_REVIEW`.

Human, by an admin at `POST /reviews/:versionId/decision`: `APPROVE`,
`REQUEST_CHANGES`, or `REJECT` (the latter two need a reason). Only `APPROVE`
starts the build.

Failure states and who clears them:

| State | Meaning | Cleared by |
|---|---|---|
| `PREFLIGHT_FAILED` | manifest, Dockerfile, or policy problem | publisher fixes and resubmits |
| `PREFLIGHT_BLOCKED_INFRA` | build node unreachable / transfer failed | admin retries, no new upload |
| `CHANGES_REQUESTED` | reviewer asked for changes | publisher resubmits — no new upload needed if the source is unchanged |
| `IMAGE_SCAN_FAILED` | image built but failed its scan | admin, after the finding is resolved |
| `REJECTED` | terminal for that version | new version |

---

## 6. Build and publish

Approval enqueues the platform build. The build node builds the `Dockerfile`
from the **reviewed source**, pushes to the mesh registry
`10.88.0.11:5000/marketplace/{listing-slug}`, scans the image, and verifies it
carries `io.privos.manifestDigest` matching the canonical manifest digest
exactly. Only then does the listing move to `PUBLISHED`.

The build node only builds for creators on its
`MARKETPLACE_BUILD_PUBLISHER_ALLOWLIST`; an empty allowlist blocks everyone.

### Listing content gates

The build blocks at `APPROVED_BUILD_PENDING` with `listing_content_incomplete`
unless the listing already has all of:

- `primaryCategoryId`
- ≥ 3 `features`, ≥ 2 `useCases`
- `documentationUrl`, `privacyUrl`, `termsUrl`
- `supportEmail` or `supportUrl`
- an approved `ICON`
- ≥ 2 approved `SCREENSHOT` media, each with a `caption`

These live on the **listing**, not in `privos-app.json`, and are uploaded
through the same upload endpoint with `kind: ICON | HERO | SCREENSHOT`
(PNG/JPEG/WebP; icon ≤ 2 MB, others ≤ 10 MB; `altText` required). The assets in
`launch-kit/` exist for this step.

Data-policy disclosure is split: `dataPolicy` in the manifest describes what the
app does; `externalDestinations`, `dataCategories`, `dataResidency`,
`dataRetention`, and `uninstallDataPolicy` are listing fields.

---

## 7. Rejection quick reference

| Code | Fix |
|---|---|
| `size` / `extension` | zip only, 1 byte – 200 MB |
| `denied_path` | remove the path, usually via `.gitattributes export-ignore`; check `.env.example` first |
| `manifest_missing` | `privos-app.json` must be committed and at the archive root |
| `dockerfile_missing` | `Dockerfile` at the archive root |
| `PROPOSAL_PERMISSION_*` | see §1 — catalog, context, execution context |
| `listing_content_incomplete` | see §6 |
| manifest digest mismatch at install | the image label disagrees with the manifest; rebuild from the reviewed source |

---

## 8. After publishing

Install the published version into a throwaway tenant room and exercise the
paths the release changed. A published listing is what workspaces install; a
broken one is not fixed by a rebuild of the same version, only by a new one.
