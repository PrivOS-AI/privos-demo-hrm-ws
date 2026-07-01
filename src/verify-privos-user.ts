/**
 * Backend verification of the hub-signed user identity token.
 *
 * The hub mints a short-lived RS256 JWT (see hub `mcp-user-token-service`) and
 * pushes it to the app iframe. The frontend forwards it to this backend, which
 * verifies it against the hub's PUBLIC JWKS before trusting any identity claim.
 *
 * Trust model: the hub holds the private key; this app only ever fetches the
 * public key, so it can VERIFY a caller's identity but can never FORGE one. A
 * client-supplied `userId` is worthless without a token that verifies here.
 *
 * No JWT library needed — RS256 verification is a plain `crypto.verify` over the
 * `header.payload` segments using the public key reconstructed from the JWK.
 */
import crypto from 'node:crypto';

/** Where to fetch the hub's public JWKS. Defaults to the paired hub (PRIVOS_URL). */
const JWKS_URL = () => `${(process.env.PRIVOS_URL || '').replace(/\/$/, '')}/.well-known/mcp-apps/jwks.json`;

interface Jwk {
	kty: string;
	kid: string;
	n: string;
	e: string;
	alg?: string;
	use?: string;
}

export interface VerifiedUser {
	userId: string;
	username: string;
	appId: string;
	roomId?: string;
	issuedAt: number;
	expiresAt: number;
}

/** Cache the JWKS briefly so we don't refetch on every call, but still pick up key rotation. */
let jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getJwks(forceRefresh = false): Promise<Jwk[]> {
	const now = Date.now();
	if (!forceRefresh && jwksCache && now - jwksCache.fetchedAt < JWKS_TTL_MS) {
		return jwksCache.keys;
	}
	const url = JWKS_URL();
	const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
	if (!res.ok) throw new Error(`JWKS fetch failed (${res.status}) from ${url}`);
	const body = (await res.json()) as { keys?: Jwk[] };
	if (!Array.isArray(body?.keys) || body.keys.length === 0) throw new Error('JWKS has no keys');
	jwksCache = { keys: body.keys, fetchedAt: now };
	return body.keys;
}

const b64urlToBuffer = (s: string): Buffer => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const decodeSegment = (s: string): any => JSON.parse(b64urlToBuffer(s).toString('utf8'));

/**
 * Verify a hub user-identity token. Returns the verified identity, or throws with
 * a reason. Optionally enforce that the token was minted for THIS app (`aud`).
 */
export async function verifyPrivosUser(token: string | undefined, opts?: { expectedAppId?: string }): Promise<VerifiedUser> {
	if (!token || typeof token !== 'string' || token.split('.').length !== 3) {
		throw new Error('Missing or malformed user token');
	}
	const [headerSeg, payloadSeg, sigSeg] = token.split('.');
	const header = decodeSegment(headerSeg);
	if (header.alg !== 'RS256') throw new Error(`Unexpected token alg: ${header.alg} (only RS256 accepted)`);

	// Find the signing key by kid; refetch once if the kid is unknown (rotation).
	let keys = await getJwks();
	let jwk = keys.find((k) => k.kid === header.kid);
	if (!jwk) {
		keys = await getJwks(true);
		jwk = keys.find((k) => k.kid === header.kid);
	}
	if (!jwk) throw new Error(`No JWKS key matches token kid ${header.kid}`);

	const publicKey = crypto.createPublicKey({ key: jwk as unknown as crypto.JsonWebKeyInput['key'], format: 'jwk' });
	const verifier = crypto.createVerify('RSA-SHA256');
	verifier.update(`${headerSeg}.${payloadSeg}`);
	verifier.end();
	if (!verifier.verify(publicKey, b64urlToBuffer(sigSeg))) {
		throw new Error('Token signature invalid — could not be verified against hub JWKS');
	}

	const payload = decodeSegment(payloadSeg);
	const nowSec = Math.floor(Date.now() / 1000);
	if (typeof payload.exp === 'number' && payload.exp < nowSec) {
		throw new Error('Token expired');
	}
	if (opts?.expectedAppId && String(payload.aud) !== String(opts.expectedAppId)) {
		throw new Error(`Token audience ${payload.aud} does not match this app (${opts.expectedAppId})`);
	}
	if (!payload.sub) throw new Error('Token has no subject (userId)');

	return {
		userId: String(payload.sub),
		username: String(payload.preferred_username ?? payload.sub),
		appId: String(payload.aud ?? ''),
		roomId: payload.rid ? String(payload.rid) : undefined,
		issuedAt: Number(payload.iat ?? 0),
		expiresAt: Number(payload.exp ?? 0),
	};
}
