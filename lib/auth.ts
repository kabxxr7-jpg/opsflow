import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";
import type { UserRole } from "@prisma/client";

const COOKIE_NAME = "session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export type SessionClaims = {
  userId: string;
  organizationId: string;
  role: UserRole;
};

function getSecretKey() {
  return new TextEncoder().encode(env.SESSION_SECRET);
}

export async function createSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (
      typeof payload.userId !== "string" ||
      typeof payload.organizationId !== "string" ||
      typeof payload.role !== "string"
    ) {
      return null;
    }
    return {
      userId: payload.userId,
      organizationId: payload.organizationId,
      role: payload.role as UserRole,
    };
  } catch {
    return null;
  }
}

/**
 * Reads and verifies the session cookie for the current request. This is the one place a
 * Server Component/Action/Route Handler gets {userId, organizationId, role} from — nothing in
 * the app should trust an organizationId or role passed in from a client, only this.
 */
export async function getSession(): Promise<SessionClaims | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Throws if there's no valid session — for call sites that require one rather than redirect. */
export async function requireSession(): Promise<SessionClaims> {
  const session = await getSession();
  if (!session) throw new Error("No active session.");
  return session;
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
export const SESSION_MAX_AGE = SESSION_TTL_SECONDS;
