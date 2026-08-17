/**
 * Shared icon-as-data-URI resolution for every entry point that needs to hand
 * this app's icon to the Hub (pairing metadata, MCP `initialize` response).
 * Reads the icon path declared in the reviewed manifest so every surface
 * advertises the exact same icon the Marketplace listing shows.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

import _pkg from '../privos-app.json';
const pkg = _pkg as Record<string, any>;
const moduleDir = path.dirname(fileURLToPath(import.meta.url));

let cached: string | undefined | null = null;

/** Read the manifest's icon file as a data URI (`data:image/svg+xml;base64,...`). */
export function getAppIconDataUri(): string | undefined {
	if (cached !== null) return cached ?? undefined;
	const iconPath = pkg.icon?.startsWith('/') ? path.join(moduleDir, '..', pkg.icon) : undefined;
	if (!iconPath || !fs.existsSync(iconPath)) {
		cached = undefined;
		return undefined;
	}
	const ext = path.extname(iconPath).slice(1);
	const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
	const data = fs.readFileSync(iconPath).toString('base64');
	cached = `data:${mime};base64,${data}`;
	return cached;
}
