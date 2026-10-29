import { NextRequest, NextResponse } from "next/server";
import { generateDailyBriefing, AIError } from "@/lib/ai";
import { createFreshTickets, createFreshJob, advanceJobs, pruneOldRecords } from "@/lib/demo-simulation";
import { rawDb, getOrgDb } from "@/lib/db";
import { isAuthorizedCron } from "@/lib/cron-auth";

export const maxDuration = 60;

// Runs once daily (vercel.json). Without this, the live demo's "today" stays frozen on whatever
// date it was last manually seeded — this keeps it genuinely current by triggering the same real
// functions (classifyTicket, runAutomations, generateDailyBriefing) a live user would, on a
// small batch of fresh activity, then pruning old rows so the demo doesn't grow unbounded.
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // No session (cron) — iterate every organization and run the simulation once per tenant,
  // each through its own org-scoped client, never a single cross-tenant pass.
  const orgs = await rawDb.organization.findMany({ select: { id: true, slug: true } });

  // allSettled: one organization failing must not discard (or abort) the others' work.
  const settled = await Promise.allSettled(
    orgs.map(async (org) => {
      const db = getOrgDb(org.id);
      const ticketsCreated = await createFreshTickets(db, 1 + Math.round(Math.random()));
      const newJob = await createFreshJob(db);
      const jobsAdvanced = await advanceJobs(db, 1 + Math.round(Math.random()));
      const pruned = await pruneOldRecords(db);

      let briefingGenerated = false;
      try {
        await generateDailyBriefing(db);
        briefingGenerated = true;
      } catch (err) {
        if (!(err instanceof AIError)) throw err;
      }

      return {
        org: org.slug,
        ticketsCreated,
        jobCreated: newJob !== null,
        jobsAdvanced,
        pruned,
        briefingGenerated,
      };
    })
  );

  const results = settled.map((outcome, i) => {
    if (outcome.status === "fulfilled") return outcome.value;
    console.error(`cron/simulate-day: org ${orgs[i].slug} failed`, outcome.reason);
    return { org: orgs[i].slug, error: "failed" };
  });

  return NextResponse.json({ results });
}
