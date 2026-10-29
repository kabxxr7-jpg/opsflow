import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { rawDb, getOrgDb } from "../lib/db";
import { deleteRuleWithHistory, deleteWebhookWithHistory } from "../lib/cleanup";
import { assertLocalDb, dropOrgs, makeOrg } from "./helpers";

type Fixture = Awaited<ReturnType<typeof makeOrg>>;
let A: Fixture;
let B: Fixture;

before(async () => {
  assertLocalDb();
  A = await makeOrg("cleanup-a");
  B = await makeOrg("cleanup-b");
});
after(async () => {
  await dropOrgs(A?.org.id, B?.org.id);
  await rawDb.$disconnect();
});

async function ruleWithRuns(org: Fixture, runs = 3) {
  const rule = await rawDb.automationRule.create({
    data: { organizationId: org.org.id, name: "r", trigger: { type: "ticket.created" }, filters: [], actions: [{ type: "tag", value: "x" }] },
  });
  for (let i = 0; i < runs; i++) {
    await rawDb.automationRun.create({ data: { organizationId: org.org.id, ruleId: rule.id, jobId: org.job.id, status: "SUCCESS", log: "ok" } });
  }
  return rule;
}

async function hookWithDeliveries(org: Fixture, deliveries = 3) {
  const hook = await rawDb.webhookConfig.create({
    data: { organizationId: org.org.id, targetUrl: "https://example.com/h", secret: "s".repeat(16), triggerOn: ["COMPLETED"] },
  });
  for (let i = 0; i < deliveries; i++) {
    await rawDb.webhookDelivery.create({
      data: {
        organizationId: org.org.id,
        webhookConfigId: hook.id,
        jobId: org.job.id,
        eventType: "job.status_changed",
        payload: {},
        attemptNumber: 1,
        success: true,
        statusCode: 200,
      },
    });
  }
  return hook;
}

describe("the problem this exists to solve", () => {
  test("a plain delete of a rule that has run is refused by the database", async () => {
    const rule = await ruleWithRuns(A);
    await assert.rejects(getOrgDb(A.org.id).automationRule.delete({ where: { id: rule.id } }), (e: { code?: string }) => e.code === "P2003");
  });
  test("so is a plain delete of a webhook endpoint that has deliveries", async () => {
    const hook = await hookWithDeliveries(A);
    await assert.rejects(getOrgDb(A.org.id).webhookConfig.delete({ where: { id: hook.id } }), (e: { code?: string }) => e.code === "P2003");
  });
});

describe("deleteRuleWithHistory", () => {
  test("removes the rule and its run history, but not the jobs the runs pointed at", async () => {
    const rule = await ruleWithRuns(A);
    await deleteRuleWithHistory(getOrgDb(A.org.id), rule.id);
    assert.equal(await rawDb.automationRule.findUnique({ where: { id: rule.id } }), null);
    assert.equal(await rawDb.automationRun.count({ where: { ruleId: rule.id } }), 0);
    assert.ok(await rawDb.job.findUnique({ where: { id: A.job.id } }));
  });

  test("works for a rule with no history", async () => {
    const rule = await ruleWithRuns(A, 0);
    await assert.doesNotReject(deleteRuleWithHistory(getOrgDb(A.org.id), rule.id));
  });

  test("can't be pointed at another organization's rule — and leaves its history alone", async () => {
    const theirs = await ruleWithRuns(B);
    await assert.rejects(deleteRuleWithHistory(getOrgDb(A.org.id), theirs.id));
    assert.ok(await rawDb.automationRule.findUnique({ where: { id: theirs.id } }), "B's rule must survive");
    assert.equal(await rawDb.automationRun.count({ where: { ruleId: theirs.id } }), 3, "B's run history must survive");
    assert.equal((await rawDb.automationRule.findUnique({ where: { id: theirs.id } }))?.isActive, true, "B's rule must not even be deactivated");
  });
});

describe("deleteWebhookWithHistory", () => {
  test("removes the endpoint and its deliveries", async () => {
    const hook = await hookWithDeliveries(A);
    await deleteWebhookWithHistory(getOrgDb(A.org.id), hook.id);
    assert.equal(await rawDb.webhookConfig.findUnique({ where: { id: hook.id } }), null);
    assert.equal(await rawDb.webhookDelivery.count({ where: { webhookConfigId: hook.id } }), 0);
  });

  test("can't be pointed at another organization's endpoint", async () => {
    const theirs = await hookWithDeliveries(B);
    await assert.rejects(deleteWebhookWithHistory(getOrgDb(A.org.id), theirs.id));
    assert.ok(await rawDb.webhookConfig.findUnique({ where: { id: theirs.id } }));
    assert.equal(await rawDb.webhookDelivery.count({ where: { webhookConfigId: theirs.id } }), 3);
  });
});
