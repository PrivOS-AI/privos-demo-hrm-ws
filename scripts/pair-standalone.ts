/**
 * One-time standalone pairing (`npm run pair:standalone`). Connects to a
 * pairing URL issued by a standalone (portal-less) Hub, persists the
 * resulting identity file (mode 0600, `wx` — refuses to overwrite an
 * existing file), and prints the Hub fingerprint for out-of-band operator
 * verification. Run once per install; `npm run start:standalone` then loads
 * the file this produces.
 *
 * A Hub that does not support standalone pairing (`pairingVersion !== 2`)
 * returns credentials only, with no dispatch trust — refused here rather
 * than silently starting an unverifiable "standalone" install.
 */
import readline from 'node:readline';

import { pairFromDescriptor, type PairingResult } from '@privos_ai/app-server';
import WebSocket from 'ws';

import { buildRelayAppDescriptor } from '../src/manifest';

function prompt(question: string): Promise<string> {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((resolve) => {
		rl.question(question, (answer: string) => {
			rl.close();
			resolve(answer.trim());
		});
	});
}

async function main(): Promise<void> {
	const pairUrl = await prompt('Enter the standalone Hub pairing URL: ');
	if (!pairUrl) throw new Error('No pairing URL provided');

	const paired: PairingResult = await pairFromDescriptor(pairUrl, buildRelayAppDescriptor(), WebSocket);
	if (paired.pairingVersion !== 2 || !paired.identityFilePath) {
		throw new Error(
			'This Hub did not return standalone dispatch trust (pairingVersion 2). ' +
				'Standalone production requires a Hub that supports standalone pairing.',
		);
	}

	console.log(`\nIdentity saved to ${paired.identityFilePath}`);
	console.log('Verify the fingerprint printed above out-of-band (e.g. with the operator who issued the');
	console.log('pairing URL) before running `npm run start:standalone`.');
}

main().catch((err) => {
	console.error('Pairing failed:', err instanceof Error ? err.message : err);
	process.exit(1);
});
