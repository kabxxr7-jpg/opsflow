import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient, JobStatus } from "@prisma/client";
import { getOrgDb } from "../lib/db";
import { hashPassword } from "../lib/password";
import { runAutomations } from "../lib/automations";
import { classifyTicket, generateDailyBriefing, AIError } from "../lib/ai";
import { extractTextFromImage } from "../lib/ocr";

const rawDb = new PrismaClient();

// All seed "history" below (automation runs, webhook deliveries, ticket classifications, the
// daily briefing) is produced by calling the app's real functions, the same ones a live user
// triggers by clicking around, not by writing fabricated AI output directly into the database.
// Slower to seed, but it means every number on a freshly-seeded demo is genuinely real.
//
// Multi-tenant: creates one real Organization and three real login accounts (owner + two
// technicians, real hashed passwords) and writes every tenant row through getOrgDb(org.id) —
// the same scoped-client path a real session uses, not a bypass.

const ORG_SLUG = "riverside";
const DEMO_PASSWORD = "opsflow-demo-2026";

const CUSTOMERS = [
  { name: "Maria Chen", phone: "555-0101", email: "maria.chen@example.com", address: "412 Oak St" },
  { name: "Devon Patel", phone: "555-0102", email: "devon.patel@example.com", address: "88 Birch Ave" },
  { name: "Sarah Okafor", phone: "555-0103", email: "sarah.okafor@example.com", address: "27 Maple Dr" },
  { name: "Luis Fernandez", phone: "555-0104", email: "luis.fernandez@example.com", address: "901 Cedar Ln" },
  { name: "Grace Kim", phone: "555-0105", email: "grace.kim@example.com", address: "15 Pine Ct" },
];

const TECHNICIANS = [
  { name: "Jamie Rourke", skills: ["HVAC", "Electrical"], userEmail: "tech1@riverside.demo" },
  { name: "Priya Nair", skills: ["Plumbing", "HVAC"], userEmail: "tech2@riverside.demo" },
  // Tom Baxter is a roster/crew record only — no login account, same as a real business that
  // hasn't onboarded every technician to the portal yet. Still gets assigned jobs, just can't
  // be the one to log in and see them.
  { name: "Tom Baxter", skills: ["Electrical", "General Repair"], userEmail: null },
];

const JOB_TYPES = ["HVAC repair", "HVAC install", "Plumbing inspection", "Electrical repair", "Routine maintenance"];

const TICKET_TEMPLATES: { text: string; source: string; daysAgo: number; leaveUnclassified?: boolean }[] = [
  {
    source: "phone",
    daysAgo: 1,
    text: "Customer called in a panic, AC unit stopped blowing cold air entirely, says it's been three days and it's 95 degrees inside. Wants someone out today if at all possible. Mentioned the unit is almost nine years old and she's wondering if replacement makes more sense than another repair.",
  },
  {
    source: "chat",
    daysAgo: 3,
    text: "Hi, just wanted to say the technician who came out last week did a great job, very professional and explained everything clearly. No issues since the repair. Thank you!",
  },
  {
    source: "email",
    daysAgo: 2,
    text: "I was charged $180 for the maintenance visit but I was quoted $120 over the phone. Can someone explain the discrepancy? I have the original quote in writing if needed.",
  },
  {
    source: "phone",
    daysAgo: 0,
    text: "Tenant reports a water heater making a loud banging noise every time hot water is used. Started about a week ago. Unit is original to the building, roughly 12 years old. Landlord wants an inspection before deciding on repair vs replacement.",
  },
  {
    source: "chat",
    daysAgo: 4,
    text: "Following up on our last visit, when the tech was here he mentioned our electrical panel looked outdated and might need an upgrade eventually. We'd like to get a quote for that as a separate job when convenient.",
  },
  {
    source: "phone",
    daysAgo: 5,
    leaveUnclassified: true,
    text: "Scheduling question, need to reschedule tomorrow's 2pm routine maintenance to next week instead, something came up at work. Any day after Tuesday works.",
  },
  {
    source: "email",
    daysAgo: 0,
    text: "The outlet in the kitchen the technician replaced two weeks ago has stopped working again as of this morning. Nothing plugged in has changed. This is the second time this outlet has failed.",
  },
  {
    source: "chat",
    daysAgo: 6,
    text: "Just checking in, do you offer any kind of maintenance plan or service contract? We've used you twice now for one-off repairs and would rather have something ongoing if it saves money long term.",
  },
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function daysAgoDate(days: number, hourOffset = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(d.getHours() - hourOffset, Math.floor(Math.random() * 60), 0, 0);
  return d;
}

async function main() {
  console.log("Seeding opsflow...");

  // Wipe in FK-safe order. Organization delete cascades to every tenant table, but User doesn't
  // cascade-delete Organization the other way, so this is still explicit and ordered.
  await rawDb.user.deleteMany();
  await rawDb.organization.deleteMany({ where: { slug: ORG_SLUG } });

  const org = await rawDb.organization.create({ data: { name: "Riverside Home Services", slug: ORG_SLUG } });
  const db = getOrgDb(org.id);

  const owner = await rawDb.user.create({
    data: {
      organizationId: org.id,
      email: "owner@riverside.demo",
      passwordHash: hashPassword(DEMO_PASSWORD),
      name: "Alex Rivera",
      role: "OWNER",
    },
  });
  void owner;

  const customers = await Promise.all(
    CUSTOMERS.map((c) => db.customer.create({ data: { ...c, organizationId: "" } })) // overwritten by org-scope extension
  );

  const technicians = await Promise.all(
    TECHNICIANS.map(async (t) => {
      const technician = await db.technician.create({
        data: { name: t.name, skills: t.skills, organizationId: "" }, // overwritten by org-scope extension
      });
      let userId: string | null = null;
      if (t.userEmail) {
        const user = await rawDb.user.create({
          data: {
            organizationId: org.id,
            email: t.userEmail,
            passwordHash: hashPassword(DEMO_PASSWORD),
            name: t.name,
            role: "TECHNICIAN",
          },
        });
        userId = user.id;
      }
      return { ...technician, userId };
    })
  );

  // Rules and the webhook target exist before any job/ticket does, so every event below runs
  // against the same live rule set a real user would see on /automations.
  await db.automationRule.create({
    data: {
      name: "Notify on job completion over $500",
      isActive: true,
      trigger: { type: "job.status_changed", status: "COMPLETED" },
      filters: [{ field: "revenue", op: "gt", value: 500 }],
      actions: [{ type: "webhook" }],
      organizationId: "", // overwritten by org-scope extension
    },
  });

  await db.automationRule.create({
    data: {
      name: "Flag urgent tickets for review",
      isActive: true,
      trigger: { type: "ticket.created" },
      filters: [{ field: "priority", op: "eq", value: "URGENT" }],
      actions: [{ type: "tag", value: "needs-review" }],
      organizationId: "", // overwritten by org-scope extension
    },
  });

  const appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:3002";
  await db.webhookConfig.create({
    data: {
      targetUrl: `${appBaseUrl}/api/integrations/test-echo`,
      secret: "demo-webhook-secret-change-me",
      isActive: true,
      triggerOn: ["COMPLETED"],
      organizationId: "", // overwritten by org-scope extension
    },
  });
  console.log(`Webhook deliveries will target ${appBaseUrl} — run the dev server first if seeding locally.`);

  // Jobs: mostly historical, but two COMPLETED-today-over-$500 so the automation history,
  // webhook log, and daily briefing all have real same-day substance, not just a thin trickle.
  const statuses: JobStatus[] = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "COMPLETED", "COMPLETED", "CANCELLED"];
  const jobs = [];
  for (let i = 0; i < 18; i++) {
    const forceToday = i < 2;
    const status: JobStatus = forceToday ? "COMPLETED" : pick(statuses);
    const scheduledAt = forceToday ? daysAgoDate(0, 6 - i * 2) : daysAgoDate(Math.floor(Math.random() * 30));
    const revenue = status === "COMPLETED" ? (forceToday ? 540 + Math.random() * 300 : 80 + Math.random() * 700) : null;
    const technician = Math.random() > 0.15 ? pick(technicians) : null;

    const job = await db.job.create({
      data: {
        customerId: pick(customers).id,
        technicianId: technician?.id ?? null,
        assignedToId: technician?.userId ?? null,
        organizationId: "", // overwritten by org-scope extension
        jobType: pick(JOB_TYPES),
        status,
        scheduledAt,
        completedAt: status === "COMPLETED" ? new Date(scheduledAt.getTime() + 2 * 60 * 60 * 1000) : null,
        revenue: revenue !== null ? Math.round(revenue * 100) / 100 : null,
        notes: status === "COMPLETED" ? "Job completed, parts and labor as scoped." : null,
      },
    });
    jobs.push(job);

    if (status === "COMPLETED") {
      // Real automation evaluation: fires the $500+ rule for real, including an actual signed
      // HTTP delivery attempt to the webhook target above.
      await runAutomations(db, { type: "job.status_changed", job });
    }
  }

  async function classifyAndLog(ticketId: string, rawText: string) {
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
      return updated;
    } catch (err) {
      if (err instanceof AIError) {
        console.warn(`  (left unclassified, ${err.kind}: ${err.message})`);
      } else {
        throw err;
      }
      return null;
    }
  }

  // Tickets: created through the same two-pass flow the real createTicket action uses —
  // runAutomations once before classification (logs SKIPPED, priority isn't known yet), then
  // again after a real Gemini call fills in priority (the "flag urgent" rule only has a chance
  // to actually match on this second pass). One ticket is deliberately left unclassified so the
  // live "Classify" button still has something to do.
  console.log("Classifying tickets via Gemini (this calls the real API)...");
  for (const template of TICKET_TEMPLATES) {
    const ticket = await db.ticket.create({
      data: {
        jobId: Math.random() > 0.3 ? pick(jobs).id : null,
        rawText: template.text,
        source: template.source,
        createdAt: daysAgoDate(template.daysAgo, template.daysAgo === 0 ? 3 : 0),
        organizationId: "", // overwritten by org-scope extension
      },
    });
    await runAutomations(db, { type: "ticket.created", ticket });

    if (!template.leaveUnclassified) {
      await classifyAndLog(ticket.id, template.text);
    }
  }

  // One ticket seeded end-to-end through the real OCR pipeline, same as a human uploading a
  // photo on /intake, just run automatically so the Tickets page already shows a genuine
  // ocr_upload entry without requiring a visitor to upload anything themselves.
  try {
    console.log("Running OCR + classification on the sample work order photo...");
    const imageBuffer = readFileSync(join(__dirname, "seed-assets/sample-work-order.png"));
    const ocrResult = await extractTextFromImage(imageBuffer);
    const ocrTicket = await db.ticket.create({
      data: {
        jobId: Math.random() > 0.3 ? pick(jobs).id : null,
        rawText: ocrResult.text,
        source: "ocr_upload",
        ocrConfidence: ocrResult.confidence,
        createdAt: daysAgoDate(0, 1),
        organizationId: "", // overwritten by org-scope extension
      },
    });
    await runAutomations(db, { type: "ticket.created", ticket: ocrTicket });
    await classifyAndLog(ocrTicket.id, ocrResult.text);
  } catch (err) {
    console.warn("  (skipped OCR-sourced ticket:", err instanceof Error ? err.message : err, ")");
  }

  try {
    console.log("Generating today's briefing via Gemini...");
    await generateDailyBriefing(db);
  } catch (err) {
    console.warn("  (skipped daily briefing:", err instanceof Error ? err.message : err, ")");
  }

  const [runCount, deliveryCount, classifiedCount] = await Promise.all([
    db.automationRun.count(),
    db.webhookDelivery.count(),
    db.ticket.count({ where: { classification: { not: null } } }),
  ]);

  const loginAccounts = [
    { email: "owner@riverside.demo", role: "OWNER" },
    ...TECHNICIANS.filter((t) => t.userEmail).map((t) => ({ email: t.userEmail as string, role: "TECHNICIAN" })),
  ];

  console.log(
    `Seeded org "${org.slug}" with ${loginAccounts.length} login accounts (${loginAccounts
      .map((a) => `${a.email} [${a.role}]`)
      .join(", ")}, password "${DEMO_PASSWORD}" for all), ${customers.length} customers, ` +
      `${technicians.length} technicians, ${jobs.length} jobs, ${TICKET_TEMPLATES.length + 1} tickets ` +
      `(${classifiedCount} classified), ${runCount} automation runs, ${deliveryCount} webhook deliveries.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await rawDb.$disconnect();
  });
