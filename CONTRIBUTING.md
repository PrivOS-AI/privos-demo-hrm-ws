# Contributing

Use Node.js 22 and create a focused branch. Before opening a pull request:

```bash
npm ci
npm run typecheck
npm test
npm run preflight
npm run docker:build
```

Never commit `.env`, access tokens, private keys or generated source archives. Add a scope only with
a real call site and reviewer-ready justification in `SCOPES.md`. User-facing changes require an
entry under `Unreleased` in `CHANGELOG.md`; releases use SemVer and match the marketplace listing
version.
