import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const planted = '.env.bak.preflight-test';
afterEach(() => { if (fs.existsSync(planted)) fs.unlinkSync(planted); });

describe('safe packaging', () => {
  it('keeps every .env path out of the Marketplace ZIP', () => {
    const result = spawnSync('bash', ['scripts/package-source.sh', '--allow-dirty'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    const listing = spawnSync('unzip', [
      '-Z1',
      'dist-source/ai.privos.mcp-app-demo-2.0.0.zip',
    ], { encoding: 'utf8' });
    expect(listing.status).toBe(0);
    expect(listing.stdout.split('\n').filter((entry) => /(^|\/)\.env(?:\.|$)/.test(entry))).toEqual([]);
  });

  it('rejects a planted credential-like file', () => {
    fs.writeFileSync(planted, 'TOKEN=not-a-real-secret\n');
    const result = spawnSync('bash', ['scripts/package-source.sh', '--allow-dirty'], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Unsafe credential-like files');
  });
});
