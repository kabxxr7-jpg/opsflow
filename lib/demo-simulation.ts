import { runAutomations } from "@/lib/automations";
import { classifyTicket, AIError } from "@/lib/ai";
import type { Job, JobStatus } from "@prisma/client";
import type { ScopedDb } from "@/lib/db";

// Run once daily by app/api/cron/simulate-day/route.ts so the live demo never looks frozen on
// the date it was last seeded. Every call here is the same real function a live user triggers
// by clicking around (classifyTicket, runAutomations) — this just triggers a few of them
// automatically each day, the same way prisma/seed.ts does at setup time. Takes `db` (one
// organization's scoped client) explicitly — the cron iterates every Organization and calls
// this once per org, never assuming there's only one tenant.

const MAX_TICKETS = 24;
const MAX_JOBS = 22;

const JOB_TYPES = ["HVAC repair", "HVAC install", "Plumbing inspection", "Electrical repair", "Routine maintenance"];

const FRESH_TICKET_TEMPLATES: { text: string; source: string }[] = [
  {
    source: "phone",
    text: "Customer says their thermostat screen went blank this morning and the system won't respond to any button presses. No cooling since last night.",
  },
  {
    source: "chat",
    text: "Just wanted to confirm tomorrow's appointment is still on for the morning window, didn't get a reminder text this time.",
  },
  {
    source: "email",
    text: "We'd like a quote for adding a second zone to our HVAC system, we've been meaning to get this done for a while now.",
  },
  {
    source: "phone",
    text: "Breaker keeps tripping in the garage whenever the compressor kicks on, started two days ago. Not an emergency but would like it looked at this week.",
  },
  {
    source: "chat",
    text: "The technician left a small amount of debris in the driveway after yesterday's repair, not a big deal but wanted to flag it.",
  },
  {
    source: "email",
    text: "Toilet in the upstairs bathroom is running constantly, water bill jumped noticeably this month. Would like someone out soon.",
  },
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function sample<T>(arr: T[], count: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < count && copy.length > 0) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}

async function classifyAndLog(db: ScopedDb, ticketId: string, rawText: string) {
  try {
    const result = await classifyTicket(rawText);
    const updated = await db.ticket.update({
      where: { id: ticketId },
      data: {
        classification: result.classification,
        priority: result.priority,
        summary: result.summary,
        confidence: result.confidence,
        sourceSnippet: result.sourceSnippet,
      },
    });
    await runAutomations(db, { type: "ticket.created", ticket: updated });
  } catch (err) {
    if (!(err instanceof AIError)) throw err;
    // Left unclassified — a transient Gemini error shouldn't fail the whole cron run.
  }
}

/** Creates 1-2 new tickets through the real classify + automations pipeline, dated today. */
export async function createFreshTickets(db: ScopedDb, count: number): Promise<number> {
  const jobs = await db.job.findMany();
  const templates = sample(FRESH_TICKET_TEMPLATES, count);

  for (const template of templates) {
    const ticket = await db.ticket.create({
      data: {
        jobId: jobs.length > 0 && Math.random() > 0.4 ? pick(jobs).id : null,
        rawText: template.text,
        source: template.source,
        organizationId: "", // overwritten unconditionally by the org-scope extension (lib/db.ts)
      },
    });
    await runAutomations(db, { type: "ticket.created", ticket });
    await classifyAndLog(db, ticket.id, template.text);
  }
  return templates.length;
}

/** Creates one new SCHEDULED job a few days out, so "Total jobs" moves over time too. */
export async function createFreshJob(db: ScopedDb): Promise<Job | null> {
  const [customers, technicians] = await Promise.all([db.customer.findMany(), db.technician.findMany()]);
  if (customers.length === 0) return null;

  const scheduledAt = new Date();
  scheduledAt.setDate(scheduledAt.getDate() + Math.ceil(Math.random() * 10));

  return db.job.create({
    data: {
      customerId: pick(customers).id,
      technicianId: technicians.length > 0 && Math.random() > 0.15 ? pick(technicians).id : null,
      organizationId: "", // overwritten unconditionally by the org-scope extension (lib/db.ts)
      jobType: pick(JOB_TYPES),
      status: "SCHEDULED",
      scheduledAt,
    },
  });
}

/** Advances a few SCHEDULED/IN_PROGRESS jobs to COMPLETED today, firing real automations. */
export async function advanceJobs(db: ScopedDb, count: number): Promise<number> {
  const candidates = await db.job.findMany({
    where: { status: { in: ["SCHEDULED", "IN_PROGRESS"] as JobStatus[] } },
    take: 10,
  });
  const toAdvance = sample(candidates, count);

  for (const job of toAdvance) {
    const revenue = Math.random() > 0.4 ? Math.round((420 + Math.random() * 500) * 100) / 100 : null;
    const updated = await db.job.update({
      where: { id: job.id },
      data: { status: "COMPLETED", completedAt: new Date(), revenue, notes: "Job completed, parts and labor as scoped." },
    });
    await runAutomations(db, { type: "job.status_changed", job: updated });
  }
  return toAdvance.length;
}

/** Keeps the demo from growing unbounded — deletes the oldest rows past a cap. Safe: every FK
 *  Ticket/Job participates in (AutomationRun.jobId, WebhookDelivery.jobId) is optional and
 *  defaults to SetNull on delete, so pruning never violates a constraint. */
export async function pruneOldRecords(db: ScopedDb): Promise<{ tickets: number; jobs: number }> {
  const [ticketCount, jobCount] = await Promise.all([db.ticket.count(), db.job.count()]);

  let prunedTickets = 0;
  if (ticketCount > MAX_TICKETS) {
    const excess = await db.ticket.findMany({
      orderBy: { createdAt: "asc" },
      take: ticketCount - MAX_TICKETS,
      select: { id: true },
    });
    const result = await db.ticket.deleteMany({ where: { id: { in: excess.map((t) => t.id) } } });
    prunedTickets = result.count;
  }

  let prunedJobs = 0;
  if (jobCount > MAX_JOBS) {
    const excess = await db.job.findMany({
      where: { status: { in: ["COMPLETED", "CANCELLED"] } },
      orderBy: { scheduledAt: "asc" },
      take: jobCount - MAX_JOBS,
      select: { id: true },
    });
    const result = await db.job.deleteMany({ where: { id: { in: excess.map((j) => j.id) } } });
    prunedJobs = result.count;
  }

  return { tickets: prunedTickets, jobs: prunedJobs };
}
