const FALLBACK = "/dashboard";

/**
 * Where to send someone after they sign in. The destination arrives in a query string anyone can
 * craft, so only same-origin paths are honoured: it must start with a single "/", and may not be
 * protocol-relative ("//evil.example"), contain a backslash (some browsers treat it as "/"), or
 * loop back to the login page.
 */
export function safeNextPath(from: unknown): string {
  if (typeof from !== "string" || from.length === 0 || from.length > 512) return FALLBACK;
  if (!/^\/(?![/\\])[^\s\\]*$/.test(from)) return FALLBACK;
  if (from === "/login" || from.startsWith("/login/") || from.startsWith("/login?")) return FALLBACK;
  return from;
}
