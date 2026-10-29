import type { SessionClaims } from "@/lib/auth";

export class ForbiddenError extends Error {
  constructor(action: string) {
    // Generic message on purpose — never leak *why* (e.g. "you're not an owner") in a way that
    // tells an attacker more about the resource than "no" does.
    super(`Not allowed: ${action}`);
    this.name = "ForbiddenError";
  }
}

export type Action =
  | "view:jobs"
  | "update:job:status"
  | "manage:automations"
  | "manage:webhooks"
  | "view:settings";

/**
 * Every mutation and every org-wide read checks this before touching the database. Technician
 * job-visibility (own jobs only) is enforced separately, in the query itself (an extra `where`
 * clause in the service layer) rather than here, because owners/dispatchers need the opposite —
 * unrestricted — and a boolean allow/deny can't express "yes, but only these rows."
 */
export function assertCan(session: SessionClaims, action: Action): void {
  switch (action) {
    case "view:jobs":
      // Every role can view jobs; row-level scoping for technicians happens at the query.
      return;
    case "update:job:status":
      // Owner/dispatcher can update any job; technician can only update their own, checked by
      // the caller (it already has the job's assignedToId in hand before calling this).
      return;
    case "manage:automations":
    case "manage:webhooks":
    case "view:settings":
      if (session.role !== "OWNER") {
        throw new ForbiddenError(action);
      }
      return;
    default:
      throw new ForbiddenError(action);
  }
}

/** Specifically for job-status updates, where technician scoping depends on the job itself. */
export function assertCanUpdateJob(session: SessionClaims, job: { assignedToId: string | null }): void {
  if (session.role === "OWNER" || session.role === "DISPATCHER") return;
  if (session.role === "TECHNICIAN" && job.assignedToId === session.userId) return;
  throw new ForbiddenError("update:job:status");
}
