import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { rawDb, getOrgDb } from "../lib/db";
import { runAutomations } from "../lib/automations";
import { assertLocalDb, dropOrgs, makeOrg } from "./helpers";

type Fixture = Awaited<ReturnType<typeof makeOrg>>;
let F: Fixture;

before(async () => {
  assertLocalDb();
  F = await makeOrg("automations");
});
after(async () => {
  await dropOrgs(F?.org.id);
  await rawDb.$disconnect();
});

const db = () => getOrgDb(F.org.id);

async function addRule(name: string, trigger: unknown, filters: unknown, actions: unknown = [{ type: "tag", value: "t" }]) {
  return rawDb.automationRule.create({
    data: { organizationId: F.org.id, name, trigger: trigger as object, filters: filters as object, actions: actions as object },
  });
}
async function runsFor(ruleId: string) {
  return rawDb.automationRun.findMany({ where: { ruleId }, orderBy: { createdAt: "asc" } });
}
async function completedJob(revenue: string | null) {
  return rawDb.job.update({
    where: { id: F.job.id },
    data: { status: "COMPLETED", completedAt: new Date(), revenue },
  });
}

describe("job.status_changed rules", () => {
  test("a revenue filter matches above the threshold and is skipped below it", async () => {
    const rule = await addRule("big", { type: "job.status_changed", status: "COMPLETED" }, [{ field: "revenue", op: "gt", value: 500 }]);

    await runAutomations(db(), { type: "job.status_changed", job: await completedJob("540.00"), fromStatus: "IN_PROGRESS" });
    await runAutomations(db(), { type: "job.status_changed", job: await completedJob("99.00"), fromStatus: "IN_PROGRESS" });

    const runs = await runsFor(rule.id);
    assert.deepEqual(runs.map((r) => r.status), ["SUCCESS", "SKIPPED"]);
  });

  test("a job with no recorded revenue is never read as $0 by a numeric filter", async () => {
    const rule = await addRule("cheap", { type: "job.status_changed", status: "COMPLETED" }, [{ field: "revenue", op: "lt", value: "100" }]);
    await runAutomations(db(), { type: "job.status_changed", job: await completedJob(null), fromStatus: "IN_PROGRESS" });
    assert.deepEqual((await runsFor(rule.id)).map((r) => r.status), ["SKIPPED"]);
  });

  test("equality ignores case and number formatting", async () => {
    const byStatus = await addRule("status", { type: "job.status_changed" }, [{ field: "status", op: "eq", value: "completed" }]);
    const byAmount = await addRule("amount", { type: "job.status_changed" }, [{ field: "revenue", op: "eq", value: "540" }]);
    await runAutomations(db(), { type: "job.status_changed", job: await completedJob("540.00"), fromStatus: "IN_PROGRESS" });
    assert.deepEqual((await runsFor(byStatus.id)).map((r) => r.status), ["SUCCESS"]);
    assert.deepEqual((await runsFor(byAmount.id)).map((r) => r.status), ["SUCCESS"]);
  });

  test("a rule for a different status doesn't fire (and doesn't log noise)", async () => {
    const rule = await addRule("cancelled only", { type: "job.status_changed", status: "CANCELLED" }, []);
    await runAutomations(db(), { type: "job.status_changed", job: await completedJob("10"), fromStatus: "IN_PROGRESS" });
    assert.equal((await runsFor(rule.id)).length, 0);
  });

  test("inactive rules are ignored", async () => {
    const rule = await rawDb.automationRule.create({
      data: { organizationId: F.org.id, name: "off", isActive: false, trigger: { type: "job.status_changed" }, filters: [], actions: [{ type: "tag", value: "x" }] },
    });
    await runAutomations(db(), { type: "job.status_changed", job: await completedJob("10"), fromStatus: "IN_PROGRESS" });
    assert.equal((await runsFor(rule.id)).length, 0);
  });
});

describe("ticket.created rules", () => {
  test("match on the ticket's own fields", async () => {
    const rule = await addRule("urgent", { type: "ticket.created" }, [{ field: "priority", op: "eq", value: "URGENT" }]);
    const urgent = await rawDb.ticket.create({ data: { organizationId: F.org.id, rawText: "flooding!", source: "phone", priority: "URGENT" } });
    const calm = await rawDb.ticket.create({ data: { organizationId: F.org.id, rawText: "tune-up", source: "chat", priority: "LOW" } });
    await runAutomations(db(), { type: "ticket.created", ticket: urgent });
    await runAutomations(db(), { type: "ticket.created", ticket: calm });
    assert.deepEqual((await runsFor(rule.id)).map((r) => r.status), ["SUCCESS", "SKIPPED"]);
  });
});

describe("resilience: one bad rule must never take the others (or the caller) down", () => {
  test("a malformed rule is logged as FAILED and the healthy rule still runs", async () => {
    const broken = await addRule("broken", { type: "ticket.created", status: 7 }, [{ field: "nope", op: "regex", value: "(" }], "not-an-array");
    const healthy = await addRule("healthy", { type: "ticket.created" }, []);
    const ticket = await rawDb.ticket.create({ data: { organizationId: F.org.id, rawText: "x", source: "chat" } });

    await assert.doesNotReject(runAutomations(db(), { type: "ticket.created", ticket }));

    const brokenRuns = await runsFor(broken.id);
    assert.equal(brokenRuns.length, 1);
    assert.equal(brokenRuns[0].status, "FAILED");
    assert.match(brokenRuns[0].log ?? "", /invalid and was skipped/);
    assert.deepEqual((await runsFor(healthy.id)).map((r) => r.status), ["SUCCESS"]);
  });

  test("a rule whose JSON is null or the wrong shape doesn't throw", async () => {
    await rawDb.automationRule.create({
      data: { organizationId: F.org.id, name: "weird", trigger: { nonsense: true }, filters: undefined, actions: [] },
    });
    const ticket = await rawDb.ticket.create({ data: { organizationId: F.org.id, rawText: "y", source: "chat" } });
    await assert.doesNotReject(runAutomations(db(), { type: "ticket.created", ticket }));
  });
});

describe("tenancy", () => {
  test("runs are recorded against the org that owns the rule", async () => {
    const rule = await addRule("owned", { type: "ticket.created" }, []);
    const ticket = await rawDb.ticket.create({ data: { organizationId: F.org.id, rawText: "z", source: "chat" } });
    await runAutomations(db(), { type: "ticket.created", ticket });
    const runs = await runsFor(rule.id);
    assert.ok(runs.length > 0);
    assert.ok(runs.every((r) => r.organizationId === F.org.id));
  });
});
