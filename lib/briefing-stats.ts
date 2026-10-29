import type { ScopedDb } from "@/lib/db";

/**
 * One definition of "what a briefing covers", used by both the generator (what the model is
 * told) and the briefings page (the figures shown above the narrative). They used to be computed
 * separately — the model was handed jobs *created* today, the page counted jobs *completed* today
 * — so a briefing could say "18 jobs completed" directly beneath a header saying "2". Sharing the
 * window and the query makes that disagreement impossible by construction.
 */
export const BRIEFING_WINDOW_MS = 24 * 60 * 60 * 1000;

export function briefingWindow(at: Date) {
  return { start: new Date(at.getTime() - BRIEFING_WINDOW_MS), end: at };
}

export async function getBriefingStats(db: ScopedDb, at: Date) {
  const { start, end } = briefingWindow(at);
  const agg = await db.job.aggregate({
    where: { completedAt: { gt: start, lte: end } },
    _sum: { revenue: true },
    _count: true,
  });
  return { jobsCompleted: agg._count, revenue: Number(agg._sum.revenue ?? 0) };
}
