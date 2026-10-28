"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/auth";

export async function login(_prevState: { error?: string } | undefined, formData: FormData) {
  const password = formData.get("password");

  if (typeof password !== "string" || password !== env.APP_PASSWORD) {
    return { error: "Incorrect password." };
  }

  const token = await createSessionToken();
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });

  redirect("/dashboard");
}
