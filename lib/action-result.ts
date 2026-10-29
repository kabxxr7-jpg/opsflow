import { ForbiddenError } from "@/lib/authz";

/**
 * Every Server Action a user can trigger returns this instead of throwing. In production Next.js
 * replaces a thrown error's message with an opaque digest, so a thrown ForbiddenError or
 * validation failure would reach the user as a generic crash page rather than something they can
 * act on. Returning the message keeps failures as a toast, and keeps the error boundary for
 * things that are genuinely unexpected.
 */
export type ActionResult = { error: string | null };

export const OK: ActionResult = { error: null };

export function fail(error: string): ActionResult {
  return { error };
}

/** A failure whose message is safe and useful to show the user as-is. */
export class UserInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserInputError";
  }
}

const NOT_FOUND = "That item no longer exists — it may have been removed. Refresh and try again.";

/** Turns known, user-facing failures into messages; rethrows anything unexpected. */
export function toActionError(err: unknown): ActionResult {
  if (err instanceof ForbiddenError) return fail("You don't have permission to do that.");
  if (err instanceof UserInputError) return fail(err.message);

  const name = (err as { name?: string } | null)?.name;
  // Raised by the org-scoped client when a row isn't in the caller's organization, and by Prisma
  // (P2025) when a row to update/delete is gone. Same answer either way — and deliberately not
  // distinguishing "doesn't exist" from "belongs to someone else".
  if (name === "OrgScopeError" || (err as { code?: string } | null)?.code === "P2025") return fail(NOT_FOUND);
  if (name === "UnsafeUrlError") return fail((err as Error).message);

  throw err;
}
