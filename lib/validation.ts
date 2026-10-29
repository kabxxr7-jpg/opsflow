import { z } from "zod";
import {
  ACTION_TYPES,
  FIELDS_BY_TRIGGER,
  FIELD_LABEL,
  FILTER_OPS,
  JOB_STATUSES,
  LIMITS,
  NUMERIC_FIELDS,
  TICKET_SOURCES,
} from "@/lib/rule-fields";
import { UserInputError } from "@/lib/action-result";

// TypeScript types disappear at runtime: a Server Action is an HTTP endpoint, and anything
// can POST to it with any shape. Every action parses its input through one of these first, and
// only ever uses the parsed (stripped, normalised) result.

const jobStatus = z.enum(JOB_STATUSES);

export const ruleInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Give the rule a name.")
      .max(LIMITS.ruleName, `Rule names are limited to ${LIMITS.ruleName} characters.`),
    isActive: z.boolean(),
    trigger: z.discriminatedUnion("type", [
      z.object({ type: z.literal("job.status_changed"), status: jobStatus.optional() }),
      z.object({ type: z.literal("ticket.created") }),
    ]),
    filters: z
      .array(
        z.object({
          field: z.string().min(1, "Pick a field to filter on."),
          op: z.enum(FILTER_OPS),
          // Existing rules store numeric thresholds as JSON numbers (e.g. revenue > 500); the
          // builder sends strings. Accept both, store one canonical form.
          value: z
            .union([z.string().trim().max(LIMITS.filterValue, "That filter value is too long."), z.number()])
            .transform((v) => String(v)),
        })
      )
      .max(LIMITS.maxFilters, `A rule can have at most ${LIMITS.maxFilters} filters.`),
    actions: z
      .array(
        z.object({
          type: z.enum(ACTION_TYPES),
          value: z.string().trim().max(LIMITS.tagValue, "That tag is too long.").optional(),
        })
      )
      .min(1, "Add at least one action.")
      .max(LIMITS.maxActions, `A rule can have at most ${LIMITS.maxActions} actions.`),
  })
  .superRefine((rule, ctx) => {
    const allowed = FIELDS_BY_TRIGGER[rule.trigger.type];
    rule.filters.forEach((f, i) => {
      const label = FIELD_LABEL[f.field] ?? f.field;
      if (!allowed.includes(f.field)) {
        ctx.addIssue({
          code: "custom",
          path: ["filters", i, "field"],
          message: `"${f.field}" isn't a field on ${rule.trigger.type === "ticket.created" ? "tickets" : "jobs"}.`,
        });
        return;
      }
      if (f.value.trim() === "") {
        ctx.addIssue({ code: "custom", path: ["filters", i, "value"], message: `Enter a value for the ${label} filter.` });
        return;
      }
      if (f.op !== "eq") {
        if (!NUMERIC_FIELDS.includes(f.field)) {
          ctx.addIssue({
            code: "custom",
            path: ["filters", i, "op"],
            message: `${label} is text, so it can only be matched with "=".`,
          });
        } else if (!Number.isFinite(Number(f.value))) {
          ctx.addIssue({
            code: "custom",
            path: ["filters", i, "value"],
            message: `"${f.value}" isn't a number — the ${label} filter needs one.`,
          });
        }
      }
    });
  });

export type ValidRule = z.infer<typeof ruleInputSchema>;

export const webhookInputSchema = z.object({
  targetUrl: z.string().trim().min(1, "Enter the URL to send events to.").max(LIMITS.url, "That URL is too long."),
  // Optional: when editing, an empty secret means "keep the one I already have" — the secret is
  // write-only, it's never sent back to the browser.
  secret: z
    .string()
    .max(LIMITS.secretMax, "That secret is too long.")
    .optional()
    .transform((s) => (s ? s : undefined)),
  isActive: z.boolean(),
  triggerOn: z
    .array(jobStatus)
    .min(1, "Pick at least one job status to fire on.")
    .transform((list) => [...new Set(list)]),
});

export const ticketInputSchema = z.object({
  rawText: z
    .string()
    .trim()
    .min(1, "Ticket text is required.")
    .max(LIMITS.ticketText, `Tickets are limited to ${LIMITS.ticketText.toLocaleString("en-US")} characters.`),
  source: z.enum(TICKET_SOURCES, "Pick where the ticket came from."),
  jobId: z.string().trim().max(64).optional(),
});

export const jobStatusInputSchema = z.object({
  jobId: z.string().trim().min(1).max(64),
  status: jobStatus,
  revenue: z
    .number("Enter the invoice amount as a number.")
    .min(0, "The amount can't be negative.")
    .max(LIMITS.maxRevenue, "That amount is too large.")
    .optional(),
});

/** Parses `input` or throws a UserInputError whose message is safe to show as-is. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new UserInputError(result.error.issues[0]?.message ?? "That input isn't valid.");
  }
  return result.data;
}
