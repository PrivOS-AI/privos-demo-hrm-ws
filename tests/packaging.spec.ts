import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const planted = '.env.bak.preflight-test';

// Read from package.json rather than hard-coding: the archive is named after the release version,
// so a pinned name silently stops pointing at anything the moment the version moves — and then
// this check passes over a file that does not exist instead of inspecting the real artifact.
const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { version: string };
const archive = `dist-source/ai.privos.mcp-app-demo-${version}.zip`;
afterEach(() => { if (fs.existsSync(planted)) fs.unlinkSync(planted); });

describe('safe packaging', () => {
  it('keeps every .env path out of the Marketplace ZIP', () => {
    const result = spawnSync('bash', ['scripts/package-source.sh', '--allow-dirty'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    const listing = spawnSync('unzip', ['-Z1', archive], { encoding: 'utf8' });
    expect(listing.status).toBe(0);
    // A ZIP that lists nothing would satisfy the .env assertion below vacuously.
    expect(listing.stdout.split('\n').filter(Boolean).length).toBeGreaterThan(0);
    expect(listing.stdout.split('\n').filter((entry) => /(^|\/)\.env(?:\.|$)/.test(entry))).toEqual([]);
  });

  it('rejects a planted credential-like file', () => {
    fs.writeFileSync(planted, 'TOKEN=not-a-real-secret\n');
    const result = spawnSync('bash', ['scripts/package-source.sh', '--allow-dirty'], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Unsafe credential-like files');
  });
});
