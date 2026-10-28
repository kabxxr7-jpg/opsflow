import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

const COOKIE_NAME = "session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecretKey() {
  return new TextEncoder().encode(env.SESSION_SECRET);
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ role: "owner" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getSecretKey());
    return true;
  } catch {
    return false;
  }
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
export const SESSION_MAX_AGE = SESSION_TTL_SECONDS;
