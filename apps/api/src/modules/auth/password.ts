import { argon2id, hash, type HashOptions, needsRehash, verify } from 'argon2';
import { randomBytes } from 'node:crypto';

/**
 * Argon2id with OWASP's recommended minimum parameters (chosen in Phase 0):
 *   memoryCost 19 MiB  every guess needs 19 MiB of RAM, which is what makes GPU and ASIC
 *                      cracking expensive: they have many cores but little memory per core;
 *   timeCost 2         two passes over that memory;
 *   parallelism 1      one lane (our server handles parallelism across requests instead).
 *
 * The hash string stores its own parameters and a random 16-byte salt:
 *   $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>
 * so changing these values later doesn't break old hashes: needsUpgrade() spots them at login.
 */
export const PASSWORD_HASH_OPTIONS = {
  type: argon2id,
  memoryCost: 19 * 1024, // in KiB
  timeCost: 2,
  parallelism: 1,
} satisfies HashOptions;

/**
 * NFKC first: the same password typed on two devices must give the same bytes (an "é" can be one
 * code point or two). The shared schema normalises too; doing it here as well means no code path
 * can hash a password differently.
 */
const normalize = (password: string) => password.normalize('NFKC');

/** Runs on libuv's thread pool, not the event loop: other requests keep being served meanwhile. */
export async function hashPassword(password: string): Promise<string> {
  return hash(normalize(password), PASSWORD_HASH_OPTIONS);
}

/** Recomputes the hash with the stored salt and parameters, then compares in constant time. */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, normalize(password));
}

/** True if a stored hash was made with weaker (or just different) parameters than today's. */
export function needsUpgrade(passwordHash: string): boolean {
  return needsRehash(passwordHash, PASSWORD_HASH_OPTIONS);
}

/**
 * A hash of a random string nobody knows, made once per process.
 *
 * Login with an unknown email still runs a full Argon2 verification against it, so the response
 * takes as long as for a real account with a wrong password. Without this, "unknown email" would
 * answer in ~1 ms and "wrong password" in ~30 ms, and anyone could test which emails have accounts.
 */
let dummyHash: Promise<string> | undefined;

function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(32).toString('base64url'));
  return dummyHash;
}

/** Spends the same time as verifyPassword(), and always fails. */
export async function verifyAgainstDummyHash(password: string): Promise<false> {
  await verifyPassword(await getDummyHash(), password);
  return false;
}

/** Called at startup, so the first login with an unknown email doesn't also pay for the hash. */
export function warmUpPasswordHashing(): Promise<void> {
  return getDummyHash().then(() => undefined);
}
