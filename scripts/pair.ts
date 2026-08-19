/**
 * One-time standalone pairing (`npm run pair` / `pnpm pair`). Asks for the
 * pairing URL the Hub operator issued, announces `privos-app.json` over the
 * pairing socket so no admin ever handles the manifest file, and — once the
 * Hub hands back dispatch trust — starts the app in standalone production
 * mode without a second command.
 *
 * ONE command (device-authorization). This run registers the app (the Hub
 * stores the announced contract, grants nothing), then WAITS: it polls the Hub
 * with the same pairing token until an admin approves the permission ceiling in
 * Hub Admin > Apps, at which point it receives the dispatch trust, writes the
 * identity file, and starts the server — no second URL. `pairAndAwaitApproval`
 * returns nothing usable before approval, so trust is never handed early.
 *
 * A Hub that answers `pairingVersion !== 2` without ever approving does not
 * support standalone pairing at all — refused here rather than silently
 * starting an unverifiable "standalone" install.
 */
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

import { buildPairingMetadata, pairAndAwaitApproval, type PairingResult } from '@privos_ai/app-server';
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
	// One `pair` + `start` convention: pairing just wrote the identity file, so a
	// plain `start` resolves to standalone-production. NODE_ENV=production keeps
	// the posture fail-closed (never a dev fallback) if that file were absent.
	const argv =
		agent === 'pnpm'
			? ['pnpm', 'start']
			: agent === 'yarn'
				? ['yarn', 'start']
				: ['npm', 'start'];

	console.log(`\nStarting the app: ${argv.join(' ')}\n`);
	return new Promise((resolve, reject) => {
		const child = spawn(argv[0], argv.slice(1), { cwd: repositoryRoot, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } });
		child.on('error', reject);
		child.on('exit', (code, signal) => resolve(signal ? 1 : (code ?? 0)));
	});
}

async function main(): Promise<void> {
	const pairUrl = await prompt('Enter the one-time pairing URL from Hub Admin: ');
	if (!pairUrl) throw new Error('No pairing URL provided');

	const manifest = JSON.parse(await readFile(path.join(repositoryRoot, 'privos-app.json'), 'utf8'));
	console.log('\nRegistering… once registered, approve the permission ceiling in Hub Admin > Apps.');
	console.log('This command will keep waiting and start the app automatically after approval.');
	const paired: PairingResult = await pairAndAwaitApproval(
		pairUrl,
		{ ...buildPairingMetadata(buildRelayAppDescriptor()), manifest },
		WebSocket,
		{ onAwaitingApproval: () => process.stdout.write('.') },
	);

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
