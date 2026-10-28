import { NextRequest, NextResponse } from "next/server";
import { generateDailyBriefing, AIError } from "@/lib/ai";
import { createFreshTickets, createFreshJob, advanceJobs, pruneOldRecords } from "@/lib/demo-simulation";

// Runs once daily (vercel.json). Without this, the live demo's "today" stays frozen on whatever
// date it was last manually seeded — this keeps it genuinely current by triggering the same real
// functions (classifyTicket, runAutomations, generateDailyBriefing) a live user would, on a
// small batch of fresh activity, then pruning old rows so the demo doesn't grow unbounded.
export async function GET(request: NextRequest) {
  // Reading request.headers unconditionally (not inside `if (cronSecret)`) is load-bearing, not
  // style: under Cache Components, `next build` prerender-probes GET route handlers by actually
  // invoking them, and only stops (deferring to request time) once it hits a request-time signal
  // like this. With CRON_SECRET unset (e.g. local dev with no .env value), the old conditional
  // version never touched `request` before reaching the real logic below, so the build-time probe
  // ran this handler for real — confirmed by finding duplicate build-time-created tickets in the
  // local dev DB. Reading it unconditionally first guarantees the probe always backs off here.
  const auth = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ticketsCreated = await createFreshTickets(1 + Math.round(Math.random()));
  const newJob = await createFreshJob();
  const jobsAdvanced = await advanceJobs(1 + Math.round(Math.random()));
  const pruned = await pruneOldRecords();

  let briefingGenerated = false;
  try {
    await generateDailyBriefing();
    briefingGenerated = true;
  } catch (err) {
    if (!(err instanceof AIError)) throw err;
  }

  return NextResponse.json({
    ticketsCreated,
    jobCreated: newJob !== null,
    jobsAdvanced,
    pruned,
    briefingGenerated,
  });
}
