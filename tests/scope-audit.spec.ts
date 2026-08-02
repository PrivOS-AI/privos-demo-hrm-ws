import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from '../privos-app.json';

describe('scope audit', () => {
  it('documents and exercises every declared scope', () => {
    const docs = fs.readFileSync(path.resolve('SCOPES.md'), 'utf8');
    const sources = fs.readdirSync(path.resolve('src/ui'))
      .filter((name) => /\.(ts|tsx)$/.test(name))
      .map((name) => fs.readFileSync(path.resolve('src/ui', name), 'utf8'))
      .join('\n');
    for (const scope of manifest.scopes) {
      expect(docs, `${scope} justification`).toContain(`\`${scope}\``);
      expect(sources, `${scope} call-site annotation`).toContain(scope);
    }
  });
});
