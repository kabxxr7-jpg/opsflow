// Shared by the rule builder UI and the server-side validation, so the form can only offer what
// the server will accept. Deliberately free of imports (no zod) so it stays out of the client bundle's weight.

export const JOB_STATUSES = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export const TRIGGER_TYPES = ["job.status_changed", "ticket.created"] as const;
export const FILTER_OPS = ["eq", "gt", "lt", "gte", "lte"] as const;
export const ACTION_TYPES = ["tag", "webhook"] as const;

export const FIELDS_BY_TRIGGER: Record<(typeof TRIGGER_TYPES)[number], readonly string[]> = {
  "job.status_changed": ["revenue", "jobType", "status"],
  "ticket.created": ["priority", "source", "classification"],
};

/** Fields that hold numbers — the only ones the ordering operators (>, <, ≥, ≤) make sense on. */
export const NUMERIC_FIELDS: readonly string[] = ["revenue"];

export const FIELD_LABEL: Record<string, string> = {
  revenue: "Revenue",
  jobType: "Job type",
  status: "Status",
  priority: "Priority",
  source: "Source",
  classification: "Classification",
};

export const TICKET_SOURCES = ["phone", "chat", "email"] as const;

export const LIMITS = {
  ruleName: 100,
  filterValue: 200,
  tagValue: 100,
  maxFilters: 10,
  maxActions: 10,
  ticketText: 4000,
  url: 2048,
  secretMin: 12,
  secretMax: 200,
  maxRevenue: 1_000_000,
  maxRulesPerOrg: 25,
  maxWebhooksPerOrg: 5,
} as const;
