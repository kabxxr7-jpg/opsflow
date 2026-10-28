import { PrismaClient, JobStatus } from "@prisma/client";

const db = new PrismaClient();

const CUSTOMERS = [
  { name: "Maria Chen", phone: "555-0101", email: "maria.chen@example.com", address: "412 Oak St" },
  { name: "Devon Patel", phone: "555-0102", email: "devon.patel@example.com", address: "88 Birch Ave" },
  { name: "Sarah Okafor", phone: "555-0103", email: "sarah.okafor@example.com", address: "27 Maple Dr" },
  { name: "Luis Fernandez", phone: "555-0104", email: "luis.fernandez@example.com", address: "901 Cedar Ln" },
  { name: "Grace Kim", phone: "555-0105", email: "grace.kim@example.com", address: "15 Pine Ct" },
];

const TECHNICIANS = [
  { name: "Jamie Rourke", skills: ["HVAC", "Electrical"] },
  { name: "Priya Nair", skills: ["Plumbing", "HVAC"] },
  { name: "Tom Baxter", skills: ["Electrical", "General Repair"] },
];

const JOB_TYPES = ["HVAC repair", "HVAC install", "Plumbing inspection", "Electrical repair", "Routine maintenance"];

const TICKET_TEMPLATES: { text: string; source: string }[] = [
  {
    source: "phone",
    text: "Customer called in a panic, AC unit stopped blowing cold air entirely, says it's been three days and it's 95 degrees inside. Wants someone out today if at all possible. Mentioned the unit is almost nine years old and she's wondering if replacement makes more sense than another repair.",
  },
  {
    source: "chat",
    text: "Hi, just wanted to say the technician who came out last week did a great job, very professional and explained everything clearly. No issues since the repair. Thank you!",
  },
  {
    source: "email",
    text: "I was charged $180 for the maintenance visit but I was quoted $120 over the phone. Can someone explain the discrepancy? I have the original quote in writing if needed.",
  },
  {
    source: "phone",
    text: "Tenant reports a water heater making a loud banging noise every time hot water is used. Started about a week ago. Unit is original to the building, roughly 12 years old. Landlord wants an inspection before deciding on repair vs replacement.",
  },
  {
    source: "chat",
    text: "Following up on our last visit, when the tech was here he mentioned our electrical panel looked outdated and might need an upgrade eventually. We'd like to get a quote for that as a separate job when convenient.",
  },
  {
    source: "phone",
    text: "Scheduling question, need to reschedule tomorrow's 2pm routine maintenance to next week instead, something came up at work. Any day after Tuesday works.",
  },
  {
    source: "email",
    text: "The outlet in the kitchen the technician replaced two weeks ago has stopped working again as of this morning. Nothing plugged in has changed. This is the second time this outlet has failed.",
  },
  {
    source: "chat",
    text: "Just checking in, do you offer any kind of maintenance plan or service contract? We've used you twice now for one-off repairs and would rather have something ongoing if it saves money long term.",
  },
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(daysBack: number): Date {
  const now = Date.now();
  return new Date(now - Math.random() * daysBack * 24 * 60 * 60 * 1000);
}

async function main() {
  console.log("Seeding opsflow...");

  await db.webhookDelivery.deleteMany();
  await db.webhookConfig.deleteMany();
  await db.automationRun.deleteMany();
  await db.automationRule.deleteMany();
  await db.ticket.deleteMany();
  await db.job.deleteMany();
  await db.technician.deleteMany();
  await db.customer.deleteMany();
  await db.dailyBriefing.deleteMany();
  await db.profile.deleteMany();

  const customers = await Promise.all(CUSTOMERS.map((c) => db.customer.create({ data: c })));
  const technicians = await Promise.all(TECHNICIANS.map((t) => db.technician.create({ data: t })));

  const statuses: JobStatus[] = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "COMPLETED", "COMPLETED", "CANCELLED"];

  const jobs = [];
  for (let i = 0; i < 18; i++) {
    const status = pick(statuses);
    const scheduledAt = randomDate(30);
    const job = await db.job.create({
      data: {
        customerId: pick(customers).id,
        technicianId: Math.random() > 0.15 ? pick(technicians).id : null,
        jobType: pick(JOB_TYPES),
        status,
        scheduledAt,
        completedAt: status === "COMPLETED" ? new Date(scheduledAt.getTime() + 2 * 60 * 60 * 1000) : null,
        revenue: status === "COMPLETED" ? Math.round((80 + Math.random() * 700) * 100) / 100 : null,
        notes: status === "COMPLETED" ? "Job completed, parts and labor as scoped." : null,
      },
    });
    jobs.push(job);
  }

  for (const template of TICKET_TEMPLATES) {
    await db.ticket.create({
      data: {
        jobId: Math.random() > 0.3 ? pick(jobs).id : null,
        rawText: template.text,
        source: template.source,
        createdAt: randomDate(7),
      },
    });
  }

  await db.webhookConfig.create({
    data: {
      targetUrl: `${process.env.APP_BASE_URL ?? "http://localhost:3002"}/api/integrations/test-echo`,
      secret: "demo-webhook-secret-change-me",
      isActive: true,
      triggerOn: ["COMPLETED"],
    },
  });

  await db.automationRule.create({
    data: {
      name: "Notify on job completion over $500",
      isActive: true,
      trigger: { type: "job.status_changed", status: "COMPLETED" },
      filters: [{ field: "revenue", op: "gt", value: 500 }],
      actions: [{ type: "webhook" }],
    },
  });

  await db.automationRule.create({
    data: {
      name: "Flag urgent tickets for review",
      isActive: true,
      trigger: { type: "ticket.created" },
      filters: [{ field: "priority", op: "eq", value: "URGENT" }],
      actions: [{ type: "tag", value: "needs-review" }],
    },
  });

  await db.profile.create({ data: {} });

  console.log(`Seeded ${customers.length} customers, ${technicians.length} technicians, ${jobs.length} jobs, ${TICKET_TEMPLATES.length} tickets.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
