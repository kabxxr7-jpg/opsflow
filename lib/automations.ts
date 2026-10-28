import { db } from "@/lib/db";
import type { Job, Ticket } from "@prisma/client";
import { triggerWebhooksForJobStatusChange } from "@/lib/webhooks";

type AutomationEvent =
  | { type: "job.status_changed"; job: Job }
  | { type: "ticket.created"; ticket: Ticket };

type FilterCondition = {
  field: string;
  op: "eq" | "gt" | "lt" | "gte" | "lte";
  value: unknown;
};

type RuleTrigger = {
  type: "job.status_changed" | "ticket.created";
  status?: string;
};

type RuleAction = {
  type: "tag" | "webhook";
  value?: string;
};

function evaluateFilter(record: Record<string, unknown>, filter: FilterCondition): boolean {
  const fieldValue = record[filter.field];
  switch (filter.op) {
    case "eq":
      return String(fieldValue) === String(filter.value);
    case "gt":
      return Number(fieldValue) > Number(filter.value);
    case "lt":
      return Number(fieldValue) < Number(filter.value);
    case "gte":
      return Number(fieldValue) >= Number(filter.value);
    case "lte":
      return Number(fieldValue) <= Number(filter.value);
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
 */
export async function runAutomations(event: AutomationEvent): Promise<void> {
  const rules = await db.automationRule.findMany({ where: { isActive: true } });
  if (rules.length === 0) return;

  const record = event.type === "job.status_changed" ? event.job : event.ticket;
  const jobId = event.type === "job.status_changed" ? event.job.id : event.ticket.jobId;

  for (const rule of rules) {
    const trigger = rule.trigger as unknown as RuleTrigger;
    if (!matchesTrigger(trigger, event)) continue;

    const filters = (rule.filters as unknown as FilterCondition[] | null) ?? [];
    const allMatch = filters.every((f) => evaluateFilter(record as unknown as Record<string, unknown>, f));

    if (!allMatch) {
      await db.automationRun.create({
        data: {
          ruleId: rule.id,
          jobId: jobId ?? undefined,
          status: "SKIPPED",
          log: "Trigger matched but filter conditions did not.",
        },
      });
      continue;
    }

    const actions = (rule.actions as unknown as RuleAction[] | null) ?? [];
    const logs: string[] = [];
    let runStatus: "SUCCESS" | "FAILED" = "SUCCESS";

    for (const action of actions) {
      try {
        if (action.type === "tag") {
          logs.push(`Tagged with "${action.value ?? "untitled"}".`);
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
          await triggerWebhooksForJobStatusChange({
            jobId: jobWithCustomer.id,
            jobType: jobWithCustomer.jobType,
            customerName: jobWithCustomer.customer.name,
            fromStatus: null,
            toStatus: jobWithCustomer.status,
          });
          logs.push("Webhook delivery triggered, see Settings for delivery log.");
        } else {
          logs.push(`Unrecognized action type, skipped.`);
        }
      } catch (err) {
        runStatus = "FAILED";
        logs.push(`Action failed: ${err instanceof Error ? err.message : "unknown error"}`);
      }
    }

    await db.automationRun.create({
      data: {
        ruleId: rule.id,
        jobId: jobId ?? undefined,
        status: runStatus,
        log: logs.join(" "),
      },
    });
  }
}
