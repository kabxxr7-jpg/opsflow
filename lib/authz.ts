import type { UserRole } from "@prisma/client";
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
  | "view:tickets"
  | "write:tickets"
  | "use:intake"
  | "view:automations"
  | "manage:automations"
  | "manage:webhooks"
  | "view:settings"
  | "view:briefings"
  | "generate:briefing";

// The whole role matrix in one place, so the UI (nav links, which dashboard widgets render) and
// the Server Actions can't drift into disagreeing about who's allowed what. Anything not listed
// for a role is denied — a new Action has to be granted deliberately.
//
// Row-level rules that depend on the specific record (a technician may only touch jobs assigned
// to them) can't be expressed as a boolean on the action, so they live next to the query that
// has the row in hand (see assertCanUpdateJob and the `assignedToId` filters).
const GRANTS: Record<UserRole, ReadonlySet<Action>> = {
  OWNER: new Set<Action>([
    "view:jobs",
    "update:job:status",
    "view:tickets",
    "write:tickets",
    "use:intake",
    "view:automations",
    "manage:automations",
    "manage:webhooks",
    "view:settings",
    "view:briefings",
    "generate:briefing",
  ]),
  DISPATCHER: new Set<Action>([
    "view:jobs",
    "update:job:status",
    "view:tickets",
    "write:tickets",
    "use:intake",
    "view:briefings",
    "generate:briefing",
  ]),
  // Tickets and intake are open to technicians on purpose (a tech in the field can log a customer's
  // message or photograph a work order), but they're listed here so that stays a decision rather
  // than something nobody checks. To narrow it, remove them from this set — pages, nav and
  // Server Actions all read from here.
  TECHNICIAN: new Set<Action>(["view:jobs", "update:job:status", "view:tickets", "write:tickets", "use:intake"]),
};

export function can(role: UserRole | null | undefined, action: Action): boolean {
  return role ? GRANTS[role].has(action) : false;
}

/** Throws if the session's role isn't granted `action`. Every mutation and org-wide read calls this. */
export function assertCan(session: SessionClaims, action: Action): void {
  if (!can(session.role, action)) {
    throw new ForbiddenError(action);
  }
}

/** Specifically for job-status updates, where technician scoping depends on the job itself. */
export function assertCanUpdateJob(session: SessionClaims, job: { assignedToId: string | null }): void {
  assertCan(session, "update:job:status");
  if (session.role === "TECHNICIAN" && job.assignedToId !== session.userId) {
    throw new ForbiddenError("update:job:status");
  }
}
