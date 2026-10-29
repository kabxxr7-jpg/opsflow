import { timingSafeEqual } from "node:crypto";

/**
 * Vercel Cron calls with `Authorization: Bearer $CRON_SECRET`. Fails closed: in production a
 * missing CRON_SECRET locks the endpoint rather than opening it (an unset variable must never
 * mean "no authentication"); only local development may run without one.
 *
 * The header is read unconditionally, first — under Cache Components, `next build` prerender-probes
 * GET route handlers by actually invoking them, and only stops (deferring to request time) once
 * it hits a request-time signal like this.
 */
export function isAuthorizedCron(request: Request): boolean {
  const header = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (!secret) return process.env.NODE_ENV !== "production";
  if (!header) return false;

  const given = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
