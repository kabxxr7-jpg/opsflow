"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { rawDb } from "@/lib/db";
import { verifyPasswordOrDummy } from "@/lib/password";
import { safeNextPath } from "@/lib/safe-path";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/auth";

export async function login(_prevState: { error?: string } | undefined, formData: FormData) {
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return { error: "Email and password are required." };
  }
  // Nothing legitimate is this long; refusing early keeps a junk request from reaching scrypt.
  if (email.length > 254 || password.length > 256) {
    return { error: "Incorrect email or password." };
  }

  // Raw client here is correct, not a bypass: there's no session yet (that's what this
  // function creates), so there's nothing to scope by. Every real org/user lookup
  // after login goes through getScopedDb().
  const user = await rawDb.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  const passwordOk = verifyPasswordOrDummy(password, user?.passwordHash);
  if (!user || !passwordOk) {
    return { error: "Incorrect email or password." };
  }

  const token = await createSessionToken({
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role,
  });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });

  redirect(safeNextPath(formData.get("from")));
}
