import type { Job, JobStatus, Ticket } from "@prisma/client";
import type { ScopedDb } from "@/lib/db";
import { triggerWebhooksForJobStatusChange } from "@/lib/webhooks";
import { ruleInputSchema } from "@/lib/validation";

type AutomationEvent =
  | { type: "job.status_changed"; job: Job; fromStatus?: JobStatus | null }
  | { type: "ticket.created"; ticket: Ticket };

type FilterCondition = {
  field: string;
  op: "eq" | "gt" | "lt" | "gte" | "lte";
  value: string;
};

type RuleTrigger = {
  type: "job.status_changed" | "ticket.created";
  status?: string;
};

/** A number, or null for "no usable number" — so a missing revenue is never silently read as 0. */
function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(typeof v === "object" ? String(v) : v); // Prisma Decimal -> its string form
  return Number.isFinite(n) ? n : null;
}

function evaluateFilter(record: Record<string, unknown>, filter: FilterCondition): boolean {
  const fieldValue = record[filter.field];
  const left = toNumber(fieldValue);
  const right = toNumber(filter.value);

  if (filter.op === "eq") {
    // "540" and "540.00" are the same amount; "completed" and "COMPLETED" are the same status.
    if (left !== null && right !== null) return left === right;
    return String(fieldValue ?? "").trim().toLowerCase() === String(filter.value).trim().toLowerCase();
  }
  if (left === null || right === null) return false;
  switch (filter.op) {
    case "gt":
      return left > right;
    case "lt":
      return left < right;
    case "gte":
      return left >= right;
    case "lte":
      return left <= right;
    default:
      return false;
  }
}

function matchesTrigger(trigger: RuleTrigger, event: AutomationEvent): boolean {
  if (event.type === "job.status_changed") {
    return trigger.type === "job.status_changed" && (!trigger.status || trigger.status === event.job.status);
  }
  if (event.type === "ticket.created") {
    return trigger.type === "ticket.created";
  }
  return false;
}

/**
 * Evaluates every active AutomationRule against an event and logs an AutomationRun
 * for each one, whether it matched, was skipped by a filter, or its actions failed.
 * Webhook actions trigger real signed delivery (lib/webhooks.ts) for job.status_changed
 * events, matched against WebhookConfig.triggerOn. Ticket-triggered rules don't have a
 * webhook delivery path yet — WebhookConfig is keyed on JobStatus, not ticket events.
 *
 * Takes `db` explicitly (org-scoped, from getScopedDb()/getOrgDb()) rather than importing a
 * global client — this function runs inside both real user sessions and the no-session cron,
 * and must never guess which organization it's operating on.
 *
 * Rule definitions are stored as JSON, so they're re-validated on every run rather than trusted:
 * a malformed rule (hand-edited, written by an older version, or submitted straight to the
 * Server Action) is logged as a failed run and skipped. It must never throw out of here — this is
 * called inline from job-status updates and ticket creation, and one bad rule shouldn't be able
 * to take those down for everyone in the organization.
 */
export async function runAutomations(db: ScopedDb, event: AutomationEvent): Promise<void> {
  const rules = await db.automationRule.findMany({ where: { isActive: true } });
  if (rules.length === 0) return;

  const record = event.type === "job.status_changed" ? event.job : event.ticket;
  const jobId = event.type === "job.status_changed" ? event.job.id : event.ticket.jobId;

  const logRun = (ruleId: string, status: "SUCCESS" | "FAILED" | "SKIPPED", log: string) =>
    db.automationRun.create({
      data: {
        ruleId,
        jobId: jobId ?? undefined,
        status,
        log,
        organizationId: "", // overwritten unconditionally by the org-scope extension (lib/db.ts)
      },
    });

  for (const rule of rules) {
    try {
      const parsed = ruleInputSchema.safeParse({
        name: rule.name,
        isActive: rule.isActive,
        trigger: rule.trigger,
        filters: rule.filters ?? [],
        actions: rule.actions,
      });

      if (!parsed.success) {
        // Only report on events the rule *claims* to care about, so a broken rule doesn't spam a
        // failed run for every unrelated event in the system.
        const rawType = (rule.trigger as { type?: unknown } | null)?.type;
        if (rawType === undefined || rawType === event.type) {
          await logRun(rule.id, "FAILED", `Rule definition is invalid and was skipped: ${parsed.error.issues[0]?.message ?? "unreadable"}.`);
        }
        continue;
      }

      const { trigger, filters, actions } = parsed.data;
      if (!matchesTrigger(trigger, event)) continue;

      const allMatch = filters.every((f) => evaluateFilter(record as unknown as Record<string, unknown>, f));
      if (!allMatch) {
        await logRun(rule.id, "SKIPPED", "Trigger matched but filter conditions did not.");
        continue;
      }

      const logs: string[] = [];
      let runStatus: "SUCCESS" | "FAILED" = "SUCCESS";

      for (const action of actions) {
        try {
          if (action.type === "tag") {
            logs.push(`Tagged with "${action.value || "untitled"}".`);
          } else if (action.type === "webhook") {
            if (event.type !== "job.status_changed") {
              logs.push("Webhook action skipped: only job.status_changed events have a delivery path.");
              continue;
            }
            const jobWithCustomer = await db.job.findUnique({
              where: { id: event.job.id },
              include: { customer: true },
            });
            if (!jobWithCustomer) {
              logs.push("Webhook action skipped: job record not found.");
              continue;
            }
            await triggerWebhooksForJobStatusChange(db, {
              jobId: jobWithCustomer.id,
              jobType: jobWithCustomer.jobType,
              customerName: jobWithCustomer.customer.name,
              fromStatus: event.fromStatus ?? null,
              toStatus: jobWithCustomer.status,
            });
            logs.push("Webhook delivery triggered, see Settings for delivery log.");
          }
        } catch (err) {
          runStatus = "FAILED";
          logs.push(`Action failed: ${err instanceof Error ? err.message : "unknown error"}`);
        }
      }

      await logRun(rule.id, runStatus, logs.join(" "));
    } catch (err) {
      // Last line of defence: record it if we can, but never propagate.
      console.error(`runAutomations: rule ${rule.id} failed unexpectedly`, err);
      try {
        await logRun(rule.id, "FAILED", "Unexpected error while evaluating this rule.");
      } catch {
        /* the database itself is unhappy; nothing more to do here */
      }
    }
  }
}
