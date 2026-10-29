import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// scrypt via Node's built-in crypto — no extra dependency (bcrypt/argon2 would need a native
// module install). scryptSync's default cost params (N=16384) are the Node-recommended baseline
// for interactive login, which this is.
const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LEN).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, KEY_LEN);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

let dummyHash: string | undefined;

/**
 * Like verifyPassword, but when there is no stored hash (no such account) it still does a full
 * scrypt against a throwaway one. Without this, "unknown email" returns measurably faster than
 * "wrong password", which lets anyone probe which emails have accounts.
 */
export function verifyPasswordOrDummy(password: string, stored: string | undefined): boolean {
  if (stored) return verifyPassword(password, stored);
  dummyHash ??= hashPassword("opsflow-timing-equaliser");
  verifyPassword(password, dummyHash);
  return false;
}
