import { describe, expect, it } from 'vitest';
import pkg from '../package.json';
import { createManifest, HUB_MANIFEST_FIELDS } from '../src/manifest';

describe('manifest', () => {
  it('is generated from package metadata and contains only parser-supported fields', () => {
    const manifest = createManifest();
    expect(Object.keys(manifest)).toEqual(HUB_MANIFEST_FIELDS);
    for (const field of HUB_MANIFEST_FIELDS) expect(manifest[field]).toEqual(pkg[field]);
  });
});
