import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createManifest, MARKETPLACE_MANIFEST_FIELDS } from '../src/manifest';
import pkg from '../package.json';
import { startHttpServer } from '../src/http-server';
import { lintManifest, SUPPORTED_MANIFEST_SCHEMA_VERSIONS } from '@privos_ai/app-server/manifest-tools';

export const PREFLIGHT_RULESET = 'marketplace-validation-mirror/2026-08-02';
const failures: string[] = [];
const fail = (message: string, fix: string) => failures.push(`${message}\n  Fix: ${fix}`);

async function main() {
console.log(`PrivOS MCP app preflight (${PREFLIGHT_RULESET})`);
console.log('NOTICE: these checks mirror the portal rules until the shared marketplace validation module is published.');

const manifest = createManifest();
if (JSON.stringify(Object.keys(manifest)) !== JSON.stringify(MARKETPLACE_MANIFEST_FIELDS)) {
  fail('Manifest contains unsupported or missing fields.', 'Keep privos-app.json aligned with MARKETPLACE_MANIFEST_FIELDS.');
}
for (const field of ['name', 'version', 'title', 'description'] as const) {
  if (manifest[field] !== pkg[field]) {
    fail(`Manifest field "${field}" differs from package.json.`, 'Keep package identity fields synchronized with privos-app.json.');
  }
}
if (!SUPPORTED_MANIFEST_SCHEMA_VERSIONS.includes(manifest.schemaVersion) || manifest.kind !== 'mcp-app') {
  fail(
    'privos-app.json is not a supported MCP app manifest.',
    `Set schemaVersion to one of ${SUPPORTED_MANIFEST_SCHEMA_VERSIONS.join(', ')} and kind to mcp-app.`,
  );
}
if (manifest.repository !== pkg.repository.url) {
  fail('Manifest repository differs from package.json.', 'Use the canonical GitHub repository URL in both files.');
}

if (!pkg.dockerfilePath || !fs.existsSync(path.resolve(pkg.dockerfilePath))) {
  fail(`Dockerfile is missing at "${pkg.dockerfilePath || '<unset>'}".`, 'Set dockerfilePath and commit that file inside the source archive.');
}

const scopeDocs = fs.existsSync('SCOPES.md') ? fs.readFileSync('SCOPES.md', 'utf8') : '';
const uiSources = fs.readdirSync('src/ui').filter((name) => /\.(ts|tsx)$/.test(name))
  .map((name) => fs.readFileSync(path.join('src/ui', name), 'utf8')).join('\n');
const lint = lintManifest(manifest);
console.log(`canonicalManifestHash=${lint.canonicalManifestHash}`);
console.log(`publisherPermissionDeclarationHash=${lint.publisherPermissionDeclarationHash || '<unavailable>'}`);
for (const error of lint.errors) fail(`Manifest: ${error}.`, 'Run npm run manifest:lint and correct the reported contract.');
for (const permission of manifest.permissions) {
  const scope = permission.scope;
  if (!scopeDocs.includes(`\`${scope}\``) || !uiSources.includes(scope)) {
    fail(`Scope "${scope}" lacks a justification or annotated call site.`, 'Document it in SCOPES.md and reference it beside the real API call, or remove it.');
  }
}

const tiers = manifest.license?.tiers;
if (!Array.isArray(tiers) || !tiers.some((tier: any) => tier.id === 'free') || !tiers.some((tier: any) => tier.id === 'pro')) {
  fail('license.tiers is malformed.', 'Declare free and pro tiers with features arrays and numeric limits.');
} else {
  const licenseSources = fs.readFileSync('src/license.ts', 'utf8') + fs.readFileSync('src/mcp-message-handlers.ts', 'utf8');
  for (const feature of new Set(tiers.flatMap((tier: any) => tier.features || []))) {
    if (!licenseSources.includes(`assert('${feature}')`)) {
      fail(`Licensed feature "${feature}" has no code guard.`, `Add license.assert('${feature}') at the protected operation.`);
    }
  }
}

for (const required of ['scripts/package-source.sh', '.dockerignore']) {
  if (!fs.existsSync(required)) fail(`${required} is missing.`, 'Restore the safe packaging files from the reference app.');
}

const packaged = spawnSync('bash', ['scripts/package-source.sh', '--allow-dirty'], { encoding: 'utf8' });
if (packaged.status !== 0) {
  fail('Safe source packaging failed.', `Resolve the reported unsafe file or archive error:\n${packaged.stderr.trim()}`);
} else {
  const safeName = pkg.name.replaceAll('/', '-');
  const archive = `dist-source/${safeName}-${pkg.version}.zip`;
  const listing = spawnSync('unzip', ['-Z1', archive], { encoding: 'utf8' });
  if (listing.status !== 0 || !listing.stdout.split('\n').includes(pkg.dockerfilePath)) {
    fail('The declared Dockerfile is not contained in the packaged ZIP.', 'Commit Dockerfile and ensure package-source.sh includes it.');
  }
  if (!listing.stdout.split('\n').includes('privos-app.json')) {
    fail('privos-app.json is not at the ZIP root.', 'Commit the canonical manifest at the repository root.');
  }
  if (fs.statSync(archive).size > 200 * 1024 * 1024) {
    fail('The packaged archive exceeds 200 MiB.', 'Remove generated assets or dependencies from the source archive.');
  }
}

const server = startHttpServer(0);
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
if (!address || typeof address === 'string') {
  fail('Direct server did not bind a TCP port.', 'Ensure src/http-server.ts listens on 0.0.0.0.');
} else {
  const response = await fetch(`http://127.0.0.1:${address.port}/.well-known/mcp/manifest.json`);
  if (!response.ok || JSON.stringify(await response.json()) !== JSON.stringify(manifest)) {
    fail('The running app did not serve the authoritative manifest.', 'Route GET /.well-known/mcp/manifest.json to createManifest().');
  }
}
await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));

if (failures.length) {
  console.error(`\nPreflight failed (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Preflight passed.');
}

main().catch((error) => {
  console.error(`Preflight crashed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
