import fs from 'node:fs';
import path from 'node:path';
import { createManifest } from '../src/manifest';

const output = path.resolve('dist/manifest.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(createManifest(), null, 2)}\n`);
console.log(`Generated ${output}`);
