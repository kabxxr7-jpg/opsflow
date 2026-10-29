import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { rawDb, getOrgDb } from "../lib/db";

// Tenant-isolation integration tests. Each one is written the way a hostile (or just buggy)
// caller would behave: holding a scoped client for organization A, it tries to read, modify,
// delete, create into, link to, or move rows belonging to organization B. The assertion is
// always the same — B's data is untouched and A can't see it — checked through the *raw*
// client, so the test doesn't trust the thing it's testing.
//
// Runs against the local dev database only; it creates two throwaway organizations and removes
// them (cascade) afterwards.

type Fixture = Awaited<ReturnType<typeof makeOrg>>;
let A: Fixture;
let B: Fixture;

async function makeOrg(label: string) {
  const slug = `iso-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await rawDb.organization.create({ data: { name: `Isolation test ${label}`, slug } });
  const user = await rawDb.user.create({
    data: { organizationId: org.id, email: `${slug}@test.invalid`, passwordHash: "x:y", name: `User ${label}`, role: "TECHNICIAN" },
  });
  const customer = await rawDb.customer.create({ data: { organizationId: org.id, name: `Customer ${label}` } });
  const technician = await rawDb.technician.create({ data: { organizationId: org.id, name: `Tech ${label}`, skills: [] } });
  const job = await rawDb.job.create({
    data: {
      organizationId: org.id,
      customerId: customer.id,
      technicianId: technician.id,
      assignedToId: user.id,
      jobType: `Job ${label}`,
      status: "SCHEDULED",
    },
  });
  const ticket = await rawDb.ticket.create({
    data: { organizationId: org.id, rawText: `Ticket ${label}`, source: "chat", jobId: job.id },
  });
  const rule = await rawDb.automationRule.create({
    data: { organizationId: org.id, name: `Rule ${label}`, trigger: { type: "ticket.created" }, filters: [], actions: [] },
  });
  const hook = await rawDb.webhookConfig.create({
    data: { organizationId: org.id, targetUrl: "https://example.com/hook", secret: "s".repeat(16), triggerOn: ["COMPLETED"] },
  });
  return { org, user, customer, technician, job, ticket, rule, hook };
}

before(async () => {
  const url = process.env.DATABASE_URL ?? "";
  if (!/(localhost|127\.0\.0\.1)/.test(url) && process.env.ALLOW_REMOTE_TEST_DB !== "1") {
    throw new Error("Refusing to run isolation tests against a non-local database. Set ALLOW_REMOTE_TEST_DB=1 to override.");
  }
  A = await makeOrg("a");
  B = await makeOrg("b");
});

after(async () => {
  await rawDb.organization.deleteMany({ where: { id: { in: [A?.org.id, B?.org.id].filter(Boolean) as string[] } } });
  await rawDb.$disconnect();
});

const jobStillIntact = async () => {
  const job = await rawDb.job.findUnique({ where: { id: B.job.id } });
  assert.ok(job, "org B's job must still exist");
  assert.equal(job.organizationId, B.org.id, "org B's job must still belong to org B");
  assert.equal(job.status, "SCHEDULED", "org B's job must be unmodified");
  assert.equal(job.jobType, "Job b", "org B's job must be unmodified");
};

describe("reads", () => {
  test("findMany only returns the caller's rows", async () => {
    const jobs = await getOrgDb(A.org.id).job.findMany();
    assert.deepEqual(jobs.map((j) => j.id), [A.job.id]);
  });

  test("findFirst by another org's id returns nothing", async () => {
    assert.equal(await getOrgDb(A.org.id).job.findFirst({ where: { id: B.job.id } }), null);
  });

  test("findUnique / findUniqueOrThrow by another org's id behave as 'not found'", async () => {
    const db = getOrgDb(A.org.id);
    assert.equal(await db.job.findUnique({ where: { id: B.job.id } }), null);
    await assert.rejects(db.job.findUniqueOrThrow({ where: { id: B.job.id } }));
  });

  test("findUnique still works for the caller's own row, even with a narrow select", async () => {
    const db = getOrgDb(A.org.id);
    assert.equal((await db.job.findUnique({ where: { id: A.job.id } }))?.id, A.job.id);
    assert.deepEqual(await db.job.findUnique({ where: { id: A.job.id }, select: { id: true } }), { id: A.job.id });
  });

  test("count, aggregate and groupBy are scoped", async () => {
    const db = getOrgDb(A.org.id);
    assert.equal(await db.ticket.count(), 1);
    assert.equal((await db.job.aggregate({ _count: true }))._count, 1);
    const groups = await db.job.groupBy({ by: ["status"], _count: { _all: true } });
    assert.equal(groups.reduce((n, g) => n + g._count._all, 0), 1);
  });

  test("a caller-supplied organizationId in a filter can't widen the scope", async () => {
    const db = getOrgDb(A.org.id);
    const viaEq = await db.job.findMany({ where: { organizationId: B.org.id } });
    const viaOr = await db.job.findMany({ where: { OR: [{ organizationId: B.org.id }, { organizationId: A.org.id }] } });
    assert.equal(viaEq.length, 0);
    assert.deepEqual(viaOr.map((j) => j.id), [A.job.id]);
  });
});

describe("writes", () => {
  test("update on another org's row fails and leaves it untouched", async () => {
    await assert.rejects(getOrgDb(A.org.id).job.update({ where: { id: B.job.id }, data: { status: "COMPLETED" } }));
    await jobStillIntact();
  });

  test("delete on another org's row fails and leaves it in place", async () => {
    await assert.rejects(getOrgDb(A.org.id).job.delete({ where: { id: B.job.id } }));
    await jobStillIntact();
  });

  test("updateMany / deleteMany with an empty filter only affect the caller's rows", async () => {
    const db = getOrgDb(A.org.id);
    await db.ticket.create({ data: { rawText: "extra", source: "chat", organizationId: "" } });
    const updated = await db.ticket.updateMany({ data: { summary: "touched" } });
    assert.equal(updated.count, 2);
    assert.equal((await rawDb.ticket.findUnique({ where: { id: B.ticket.id } }))?.summary, null);
    const deleted = await db.ticket.deleteMany();
    assert.equal(deleted.count, 2);
    assert.ok(await rawDb.ticket.findUnique({ where: { id: B.ticket.id } }), "org B's ticket must survive");
    A.ticket = await rawDb.ticket.create({ data: { organizationId: A.org.id, rawText: "Ticket a", source: "chat", jobId: A.job.id } });
  });

  test("create ignores a caller-supplied organizationId and files the row under the caller's org", async () => {
    const db = getOrgDb(A.org.id);
    const created = await db.customer.create({ data: { name: "Smuggled", organizationId: B.org.id } });
    assert.equal(created.organizationId, A.org.id);
    await rawDb.customer.delete({ where: { id: created.id } });
  });

  test("createMany files every row under the caller's org", async () => {
    const db = getOrgDb(A.org.id);
    await db.customer.createMany({ data: [{ name: "m1", organizationId: B.org.id }, { name: "m2", organizationId: B.org.id }] });
    const rows = await rawDb.customer.findMany({ where: { name: { in: ["m1", "m2"] } } });
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.organizationId === A.org.id));
    await rawDb.customer.deleteMany({ where: { name: { in: ["m1", "m2"] } } });
  });

  test("createManyAndReturn files every row under the caller's org", async () => {
    const db = getOrgDb(A.org.id);
    const rows = await db.customer.createManyAndReturn({ data: [{ name: "r1", organizationId: B.org.id }] });
    assert.ok(rows.every((r) => r.organizationId === A.org.id));
    await rawDb.customer.deleteMany({ where: { name: "r1" } });
  });

  test("upsert aimed at another org's row never touches it — it just creates in the caller's org", async () => {
    const db = getOrgDb(A.org.id);
    const result = await db.job.upsert({
      where: { id: B.job.id },
      update: { status: "CANCELLED" },
      create: { customerId: A.customer.id, jobType: "x", organizationId: "" },
    });
    assert.equal(result.organizationId, A.org.id);
    assert.notEqual(result.id, B.job.id);
    await jobStillIntact();
    await rawDb.job.delete({ where: { id: result.id } });
  });

  test("upsert can't claim another org's primary key either", async () => {
    const db = getOrgDb(A.org.id);
    await assert.rejects(
      db.job.upsert({
        where: { id: B.job.id },
        update: {},
        create: { id: B.job.id, customerId: A.customer.id, jobType: "x", organizationId: "" },
      })
    );
    await jobStillIntact();
  });

  test("updateManyAndReturn only touches the caller's rows", async () => {
    const db = getOrgDb(A.org.id);
    const rows = await db.job.updateManyAndReturn({ data: { notes: "scoped" } });
    assert.ok(rows.every((r) => r.organizationId === A.org.id));
    assert.equal((await rawDb.job.findUnique({ where: { id: B.job.id } }))?.notes, null);
    await rawDb.job.update({ where: { id: A.job.id }, data: { notes: null } });
  });
});

describe("moving rows between tenants", () => {
  test("update can't reassign a row to another org via organizationId", async () => {
    await assert.rejects(getOrgDb(A.org.id).customer.update({ where: { id: A.customer.id }, data: { organizationId: B.org.id } }));
    assert.equal((await rawDb.customer.findUnique({ where: { id: A.customer.id } }))?.organizationId, A.org.id);
  });

  test("updateMany can't reassign rows to another org either", async () => {
    await assert.rejects(getOrgDb(A.org.id).customer.updateMany({ data: { organizationId: B.org.id } }));
    assert.equal((await rawDb.customer.findUnique({ where: { id: A.customer.id } }))?.organizationId, A.org.id);
  });

  test("nested relation writes can't be used to attach a row to another org", async () => {
    await assert.rejects(
      getOrgDb(A.org.id).job.update({
        where: { id: A.job.id },
        data: { organization: { connect: { id: B.org.id } } } as never,
      })
    );
    assert.equal((await rawDb.job.findUnique({ where: { id: A.job.id } }))?.organizationId, A.org.id);
  });
});

describe("cross-tenant foreign keys", () => {
  test("a job can't be created pointing at another org's customer", async () => {
    await assert.rejects(
      getOrgDb(A.org.id).job.create({ data: { customerId: B.customer.id, jobType: "x", organizationId: "" } })
    );
  });

  test("a job can't be re-pointed at another org's technician", async () => {
    await assert.rejects(getOrgDb(A.org.id).job.update({ where: { id: A.job.id }, data: { technicianId: B.technician.id } }));
    assert.equal((await rawDb.job.findUnique({ where: { id: A.job.id } }))?.technicianId, A.technician.id);
  });

  test("a job can't be assigned to another org's user", async () => {
    await assert.rejects(getOrgDb(A.org.id).job.update({ where: { id: A.job.id }, data: { assignedToId: B.user.id } }));
  });

  test("a ticket can't be linked to another org's job", async () => {
    await assert.rejects(
      getOrgDb(A.org.id).ticket.create({ data: { rawText: "x", source: "chat", jobId: B.job.id, organizationId: "" } })
    );
  });

  test("linking to the caller's own records still works", async () => {
    const db = getOrgDb(A.org.id);
    const t = await db.ticket.create({ data: { rawText: "ok", source: "chat", jobId: A.job.id, organizationId: "" } });
    assert.equal(t.jobId, A.job.id);
    await rawDb.ticket.delete({ where: { id: t.id } });
  });
});

describe("the scoped client's own surface", () => {
  test("can't read other tenants' users or organizations through it", async () => {
    const db = getOrgDb(A.org.id) as unknown as Record<string, { findMany: () => Promise<unknown[]> }>;
    await assert.rejects(db.user.findMany());
    await assert.rejects(db.organization.findMany());
  });

  test("raw SQL is not available on the scoped client", async () => {
    // The scoped client's types mark these as unusable; call through `any` to prove the runtime agrees.
    const db = getOrgDb(A.org.id) as unknown as Record<string, (...args: unknown[]) => unknown>;
    assert.throws(() => db.$queryRaw(["SELECT 1"]));
    assert.throws(() => db.$queryRawUnsafe("SELECT 1"));
    assert.throws(() => db.$executeRaw(["SELECT 1"]));
    assert.throws(() => db.$executeRawUnsafe("SELECT 1"));
  });
});

describe("two clients, two worlds", () => {
  test("each org sees exactly its own rows across every tenant table", async () => {
    for (const [fx, other] of [[A, B], [B, A]] as const) {
      const db = getOrgDb(fx.org.id);
      const [customers, techs, jobs, tickets, rules, hooks] = await Promise.all([
        db.customer.findMany(), db.technician.findMany(), db.job.findMany(),
        db.ticket.findMany(), db.automationRule.findMany(), db.webhookConfig.findMany(),
      ]);
      for (const rows of [customers, techs, jobs, tickets, rules, hooks]) {
        assert.equal(rows.length, 1);
        assert.equal(rows[0].organizationId, fx.org.id);
        assert.notEqual(rows[0].organizationId, other.org.id);
      }
    }
  });
});

describe("nested reads can't reach the blocked models either", () => {
  // `db.user` is refused outright, but a relation is another way to a User row — and with it a
  // password hash. Every include/select is walked, however deep.
  const db = () => getOrgDb(A.org.id);

  test("a direct include of a user relation is refused", async () => {
    await assert.rejects(db().job.findMany({ include: { assignedTo: true } }), /User/);
  });

  test("so is selecting through it", async () => {
    await assert.rejects(db().job.findMany({ select: { id: true, assignedTo: { select: { passwordHash: true } } } }), /User/);
  });

  test("so is reaching the organization (and from it, its users)", async () => {
    await assert.rejects(db().customer.findMany({ include: { organization: { include: { users: true } } } }), /Organization/);
  });

  test("and so is a deep path that only arrives there at the end", async () => {
    await assert.rejects(db().ticket.findMany({ include: { job: { include: { assignedTo: true } } } }), /User/);
    await assert.rejects(db().automationRun.findMany({ include: { rule: { include: { organization: true } } } }), /Organization/);
  });

  test("also on writes that return rows", async () => {
    await assert.rejects(db().customer.create({ data: { name: "x", organizationId: "" }, include: { organization: true } }), /Organization/);
    assert.equal(await rawDb.customer.count({ where: { organizationId: A.org.id, name: "x" } }), 0, "nothing should have been written");
  });

  test("ordinary nested includes of tenant models still work", async () => {
    const jobs = await db().job.findMany({ include: { customer: true, technician: true, tickets: true } });
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].customer.organizationId, A.org.id);
  });
});
