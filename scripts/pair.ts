/**
 * One-time standalone pairing (`npm run pair` / `pnpm pair`). Asks for the
 * pairing URL the Hub operator issued, announces `privos-app.json` over the
 * pairing socket so no admin ever handles the manifest file, and — once the
 * Hub hands back dispatch trust — starts the app in standalone production
 * mode without a second command.
 *
 * Pairing happens TWICE, and the two runs mean different things:
 *   1. The first run REGISTERS the app. The Hub stores the announced contract,
 *      grants nothing, and reports `awaitingApproval` — an admin still decides
 *      the permission ceiling in Hub Admin > Apps. There is no identity file
 *      yet and nothing to start, so this run stops there deliberately.
 *   2. After approval, run it again with a fresh URL from that app's settings.
 *      The Hub re-hands the same credentials plus its dispatch trust, the SDK
 *      writes the identity file, and the server starts.
 *
 * A Hub that answers `pairingVersion !== 2` without `awaitingApproval` does not
 * support standalone pairing at all — refused here rather than silently
 * starting an unverifiable "standalone" install.
 */
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

import { buildPairingMetadata, pairOverWebSocket, type PairingResult } from '@privos_ai/app-server';
import WebSocket from 'ws';

import { buildRelayAppDescriptor } from '../src/manifest';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function prompt(question: string): Promise<string> {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((resolve) => {
		rl.question(question, (answer: string) => {
			rl.close();
			resolve(answer.trim());
		});
	});
}

/**
 * Runs the follow-on script through whichever package manager invoked this one,
 * so `pnpm pair` continues into `pnpm`, not a stray global `npm`.
 */
function runStandaloneServer(): Promise<number> {
	const agent = (process.env.npm_config_user_agent || '').split('/')[0];
	const argv =
		agent === 'pnpm'
			? ['pnpm', 'start:standalone']
			: agent === 'yarn'
				? ['yarn', 'start:standalone']
				: ['npm', 'run', 'start:standalone'];

	console.log(`\nStarting the app: ${argv.join(' ')}\n`);
	return new Promise((resolve, reject) => {
		const child = spawn(argv[0], argv.slice(1), { cwd: repositoryRoot, stdio: 'inherit' });
		child.on('error', reject);
		child.on('exit', (code, signal) => resolve(signal ? 1 : (code ?? 0)));
	});
}

async function main(): Promise<void> {
	const pairUrl = await prompt('Enter the one-time pairing URL from Hub Admin: ');
	if (!pairUrl) throw new Error('No pairing URL provided');

	const manifest = JSON.parse(await readFile(path.join(repositoryRoot, 'privos-app.json'), 'utf8'));
	const paired: PairingResult = await pairOverWebSocket(
		pairUrl,
		{ ...buildPairingMetadata(buildRelayAppDescriptor()), manifest },
		WebSocket,
	);

	if (paired.awaitingApproval) {
		console.log(`\nRegistered as ${paired.mcpAppId ?? 'unknown app'} — awaiting admin approval of the permission ceiling.`);
		console.log('Approve it in Hub Admin > Apps, then run this command again with a fresh pairing URL');
		console.log("from that app's settings to receive dispatch trust and start the app.");
		return;
	}

	if (paired.pairingVersion !== 2 || !paired.identityFilePath) {
		throw new Error(
			'This Hub did not return standalone dispatch trust (pairingVersion 2). ' +
				'Standalone production requires a Hub that supports standalone pairing.',
		);
	}

	console.log(`\nIdentity saved to ${paired.identityFilePath}`);
	console.log('Verify the fingerprint printed above out-of-band (e.g. with the operator who issued the');
	console.log('pairing URL) before trusting dispatch from this Hub.');

	process.exitCode = await runStandaloneServer();
}

main().catch((err) => {
	// The SDK already labels its own connection failures "Pairing failed"; drop that
	// prefix rather than printing it twice.
	const reason = String(err instanceof Error ? err.message : err).replace(/^Pairing failed: /, '');
	console.error(`\nPairing failed: ${reason}`);
	process.exit(1);
});
