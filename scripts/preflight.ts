import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createManifest, HUB_MANIFEST_FIELDS } from '../src/manifest';
import pkg from '../package.json';
import { startHttpServer } from '../src/http-server';

export const PREFLIGHT_RULESET = 'marketplace-validation-mirror/2026-07-26';
const failures: string[] = [];
const fail = (message: string, fix: string) => failures.push(`${message}\n  Fix: ${fix}`);

async function main() {
console.log(`PrivOS MCP app preflight (${PREFLIGHT_RULESET})`);
console.log('NOTICE: these checks mirror the portal rules until the shared marketplace validation module is published.');

const manifest = createManifest();
if (JSON.stringify(Object.keys(manifest)) !== JSON.stringify(HUB_MANIFEST_FIELDS)) {
  fail('Manifest contains unsupported or missing fields.', 'Generate it through src/manifest.ts using HUB_MANIFEST_FIELDS.');
}
for (const field of HUB_MANIFEST_FIELDS) {
  if (JSON.stringify(manifest[field]) !== JSON.stringify(pkg[field])) {
    fail(`Manifest field "${field}" differs from package.json.`, 'Keep package.json authoritative and regenerate the manifest.');
  }
}

if (!pkg.dockerfilePath || !fs.existsSync(path.resolve(pkg.dockerfilePath))) {
  fail(`Dockerfile is missing at "${pkg.dockerfilePath || '<unset>'}".`, 'Set dockerfilePath and commit that file inside the source archive.');
}

const scopeDocs = fs.existsSync('SCOPES.md') ? fs.readFileSync('SCOPES.md', 'utf8') : '';
const uiSources = fs.readdirSync('src/ui').filter((name) => /\.(ts|tsx)$/.test(name))
  .map((name) => fs.readFileSync(path.join('src/ui', name), 'utf8')).join('\n');
for (const scope of pkg.scopes) {
  if (!scopeDocs.includes(`\`${scope}\``) || !uiSources.includes(scope)) {
    fail(`Scope "${scope}" lacks a justification or annotated call site.`, 'Document it in SCOPES.md and reference it beside the real API call, or remove it.');
  }
}

const tiers = pkg.license?.tiers;
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
  const archive = `dist-source/${safeName}-${pkg.version}.tar.gz`;
  const listing = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8' });
  if (listing.status !== 0 || !listing.stdout.split('\n').includes(pkg.dockerfilePath)) {
    fail('The declared Dockerfile is not contained in the packaged archive.', 'Commit Dockerfile and ensure package-source.sh includes it.');
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
