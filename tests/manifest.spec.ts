import { describe, expect, it } from 'vitest';
import pkg from '../package.json';
import publisherManifest from '../privos-app.json';
import { createManifest, MARKETPLACE_MANIFEST_FIELDS } from '../src/manifest';
import { lintManifest } from '@privos_ai/app-server/manifest-tools';

describe('manifest', () => {
  it('serves the canonical Marketplace manifest', () => {
    const manifest = createManifest();
    expect(Object.keys(manifest)).toEqual(MARKETPLACE_MANIFEST_FIELDS);
    expect(manifest).toEqual(publisherManifest);
    expect(manifest.name).toBe(pkg.name);
    expect(manifest.version).toBe(pkg.version);
    expect(manifest.title).toBe(pkg.title);
    expect(manifest.repository).toBe(pkg.repository.url);
  });

  it('passes strict manifest lint and emits deterministic canonical hashes', () => {
    const report = lintManifest(createManifest());
    expect(report.valid, report.errors.join('; ')).toBe(true);
    expect(report.canonicalManifestHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(report.publisherPermissionDeclarationHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
