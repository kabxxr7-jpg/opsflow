import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { jobStatusInputSchema, parseInput, ruleInputSchema, ticketInputSchema, webhookInputSchema } from "../lib/validation";
import { UserInputError } from "../lib/action-result";
import { safeNextPath } from "../lib/safe-path";
import { LIMITS } from "../lib/rule-fields";

const rule = (over: Record<string, unknown> = {}) => ({
  name: "Notify on big jobs",
  isActive: true,
  trigger: { type: "job.status_changed", status: "COMPLETED" },
  filters: [{ field: "revenue", op: "gt", value: "500" }],
  actions: [{ type: "tag", value: "big-job" }],
  ...over,
});

describe("ruleInputSchema", () => {
  test("accepts a well-formed rule and trims the name", () => {
    const parsed = ruleInputSchema.parse(rule({ name: "  Notify  " }));
    assert.equal(parsed.name, "Notify");
  });

  test("accepts numeric filter values from older rules and stores them as strings", () => {
    const parsed = ruleInputSchema.parse(rule({ filters: [{ field: "revenue", op: "gt", value: 500 }] }));
    assert.equal(parsed.filters[0].value, "500");
  });

  test("a job trigger without a status means 'any status'", () => {
    assert.ok(ruleInputSchema.safeParse(rule({ trigger: { type: "job.status_changed" } })).success);
  });

  const bad: [string, Record<string, unknown>, RegExp][] = [
    ["an empty name", { name: "   " }, /name/i],
    ["an over-long name", { name: "x".repeat(LIMITS.ruleName + 1) }, /limited/i],
    ["an unknown trigger", { trigger: { type: "job.deleted" } }, /./],
    ["an unknown job status", { trigger: { type: "job.status_changed", status: "EXPLODED" } }, /./],
    ["no actions", { actions: [] }, /at least one action/i],
    ["an unknown action type", { actions: [{ type: "format_disk" }] }, /./],
    ["a field from the wrong record type", { filters: [{ field: "priority", op: "eq", value: "URGENT" }] }, /isn't a field on jobs/],
    ["an ordering operator on a text field", { filters: [{ field: "jobType", op: "gt", value: "HVAC" }] }, /only be matched with "="/],
    ["a non-numeric value for a number comparison", { filters: [{ field: "revenue", op: "gt", value: "lots" }] }, /isn't a number/],
    ["an empty filter value", { filters: [{ field: "revenue", op: "eq", value: "  " }] }, /Enter a value/],
    ["too many filters", { filters: Array.from({ length: LIMITS.maxFilters + 1 }, () => ({ field: "revenue", op: "gt", value: "1" })) }, /at most/],
    ["an unknown operator", { filters: [{ field: "revenue", op: "regex", value: ".*" }] }, /./],
  ];
  for (const [label, over, message] of bad) {
    test(`rejects ${label}`, () => {
      const result = ruleInputSchema.safeParse(rule(over));
      assert.equal(result.success, false);
      if (!result.success) assert.match(result.error.issues[0].message, message);
    });
  }

  test("strips fields it doesn't know about instead of storing them", () => {
    const parsed = ruleInputSchema.parse(rule({ organizationId: "other-org", id: "x" }));
    assert.equal("organizationId" in parsed, false);
    assert.equal("id" in parsed, false);
  });
});

describe("webhookInputSchema", () => {
  const hook = (over: Record<string, unknown> = {}) => ({
    targetUrl: "https://example.com/hook",
    secret: "a-long-enough-secret",
    isActive: true,
    triggerOn: ["COMPLETED"],
    ...over,
  });

  test("a blank secret means 'keep the stored one' (undefined)", () => {
    assert.equal(webhookInputSchema.parse(hook({ secret: "" })).secret, undefined);
    assert.equal(webhookInputSchema.parse(hook({ secret: undefined })).secret, undefined);
  });

  test("requires at least one status, and de-duplicates", () => {
    assert.equal(webhookInputSchema.safeParse(hook({ triggerOn: [] })).success, false);
    assert.deepEqual(webhookInputSchema.parse(hook({ triggerOn: ["COMPLETED", "COMPLETED", "CANCELLED"] })).triggerOn, ["COMPLETED", "CANCELLED"]);
  });

  test("rejects an unknown status and an empty URL", () => {
    assert.equal(webhookInputSchema.safeParse(hook({ triggerOn: ["NOPE"] })).success, false);
    assert.equal(webhookInputSchema.safeParse(hook({ targetUrl: "   " })).success, false);
  });
});

describe("ticketInputSchema", () => {
  test("accepts a normal ticket", () => {
    assert.ok(ticketInputSchema.safeParse({ rawText: "AC is out", source: "phone" }).success);
  });
  test("rejects empty text, an over-long message, and an unknown source", () => {
    assert.equal(ticketInputSchema.safeParse({ rawText: "  ", source: "phone" }).success, false);
    assert.equal(ticketInputSchema.safeParse({ rawText: "x".repeat(LIMITS.ticketText + 1), source: "phone" }).success, false);
    assert.equal(ticketInputSchema.safeParse({ rawText: "hi", source: "carrier-pigeon" }).success, false);
  });
});

describe("jobStatusInputSchema", () => {
  test("accepts a status with or without an invoice amount", () => {
    assert.ok(jobStatusInputSchema.safeParse({ jobId: "j1", status: "COMPLETED" }).success);
    assert.ok(jobStatusInputSchema.safeParse({ jobId: "j1", status: "COMPLETED", revenue: 540.5 }).success);
  });
  test("rejects negative, absurd, and non-finite amounts", () => {
    for (const revenue of [-1, LIMITS.maxRevenue + 1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(jobStatusInputSchema.safeParse({ jobId: "j1", status: "COMPLETED", revenue }).success, false, String(revenue));
    }
  });
  test("rejects an unknown status", () => {
    assert.equal(jobStatusInputSchema.safeParse({ jobId: "j1", status: "DONE" }).success, false);
  });
});

describe("parseInput", () => {
  test("throws a UserInputError carrying a message that's safe to show", () => {
    assert.throws(
      () => parseInput(ruleInputSchema, rule({ name: "" })),
      (e: unknown) => e instanceof UserInputError && /name/i.test(e.message)
    );
  });
});

describe("safeNextPath (post-login redirect)", () => {
  test("keeps ordinary same-site paths", () => {
    assert.equal(safeNextPath("/jobs"), "/jobs");
    assert.equal(safeNextPath("/tickets?x=1"), "/tickets?x=1");
  });
  const unsafe = ["//evil.example", "/\\evil.example", "https://evil.example", "javascript:alert(1)", "evil", "", "/login", "/login?from=/jobs", "/ba d", `/${"a".repeat(600)}`];
  for (const value of unsafe) {
    test(`falls back for ${JSON.stringify(value.slice(0, 40))}`, () => assert.equal(safeNextPath(value), "/dashboard"));
  }
  test("falls back for non-strings", () => {
    assert.equal(safeNextPath(null), "/dashboard");
    assert.equal(safeNextPath(undefined), "/dashboard");
    assert.equal(safeNextPath(42), "/dashboard");
  });
});
