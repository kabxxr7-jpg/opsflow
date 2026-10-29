import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { rawDb, getOrgDb } from "../lib/db";
import { findInventedFigure, stripFigureSentences } from "../lib/ai";
import { BRIEFING_WINDOW_MS, briefingWindow, getBriefingStats } from "../lib/briefing-stats";
import { assertLocalDb, dropOrgs, makeOrg } from "./helpers";

describe("the narrative may not state figures (the database's numbers are shown next to it)", () => {
  const flagged = [
    "The team completed 18 jobs and earned $4,200 today.",
    "Revenue hit $ 900.",
    "We closed 3 work orders.",
    "There were 12 total jobs.",
    "5 new jobs came in overnight.",
    "Only 1 job was left open.",
  ];
  const clean = [
    "Several urgent plumbing requests came in overnight and need a call back first thing.",
    "A recurring complaint about missed arrival windows is worth raising with dispatch.",
    "Ticket 7a3f is a leak. Call the customer back.", // an id fragment is not a count of jobs
    "Two of the requests mention the same address.", // words, not figures
  ];
  for (const text of flagged) test(`flags: ${text}`, () => assert.ok(findInventedFigure(text), "should detect a figure"));
  for (const text of clean) test(`passes: ${text}`, () => assert.equal(findInventedFigure(text), null));

  test("stripFigureSentences drops only the offending sentences", () => {
    const out = stripFigureSentences("Calls were heavy. We completed 18 jobs today. The owner should review the urgent ones.");
    assert.equal(out, "Calls were heavy. The owner should review the urgent ones.");
  });

  test("stripFigureSentences can return an empty string when nothing is left (caller supplies a fallback)", () => {
    assert.equal(stripFigureSentences("We earned $900."), "");
  });
});

describe("briefing window", () => {
  test("covers exactly the 24 hours ending at the briefing time", () => {
    const at = new Date("2026-10-29T12:00:00Z");
    const { start, end } = briefingWindow(at);
    assert.equal(end.getTime(), at.getTime());
    assert.equal(at.getTime() - start.getTime(), BRIEFING_WINDOW_MS);
  });
});

describe("getBriefingStats", () => {
  let F: Awaited<ReturnType<typeof makeOrg>>;
  before(async () => {
    assertLocalDb();
    F = await makeOrg("briefing");
  });
  after(async () => {
    await dropOrgs(F?.org.id);
    await rawDb.$disconnect();
  });

  test("counts and sums only jobs completed inside the window, for this org only", async () => {
    const at = new Date("2026-10-29T12:00:00Z");
    const hoursAgo = (h: number) => new Date(at.getTime() - h * 3_600_000);
    const mk = (completedAt: Date | null, revenue: string, orgId = F.org.id) =>
      rawDb.job.create({
        data: { organizationId: orgId, customerId: F.customer.id, jobType: "x", status: "COMPLETED", completedAt, revenue },
      });

    await mk(hoursAgo(1), "100.00"); // in
    await mk(hoursAgo(23), "250.50"); // in
    await mk(hoursAgo(25), "999.00"); // too old
    await mk(new Date(at.getTime() + 3_600_000), "999.00"); // in the future relative to the briefing
    await mk(null, "999.00"); // never completed

    const other = await makeOrg("briefing-other");
    try {
      await rawDb.job.create({
        data: { organizationId: other.org.id, customerId: other.customer.id, jobType: "x", status: "COMPLETED", completedAt: hoursAgo(2), revenue: "5000.00" },
      });
      assert.deepEqual(await getBriefingStats(getOrgDb(F.org.id), at), { jobsCompleted: 2, revenue: 350.5 });
    } finally {
      await dropOrgs(other.org.id);
    }
  });
});
