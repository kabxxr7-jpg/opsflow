import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  CircleDashed,
  FolderClock,
  Search,
  Ticket,
  Webhook as WebhookIcon,
  XCircle,
  Zap,
} from "lucide-react";
import { getScopedDb, type ScopedDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/authz";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatCurrency, formatDateTime, formatShortDate, plural } from "@/lib/utils";
import { SCENARIO } from "@/lib/scenario";
import { JobsByStatusChart } from "@/components/jobs-by-status-chart";
import { AutomationOutcomesChart } from "@/components/automation-outcomes-chart";
import { RevenueTrendChart } from "@/components/revenue-trend-chart";

const JOB_STATUS_ORDER = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
const RUN_OUTCOME_ORDER = ["SUCCESS", "SKIPPED", "FAILED"] as const;
const RUN_OUTCOME_LABEL = { SUCCESS: "Success", SKIPPED: "Skipped", FAILED: "Failed" } as const;
const TREND_WINDOW_DAYS = 30;
const LOW_CONFIDENCE_THRESHOLD = 0.5;

type JobScope = { assignedToId?: string };

type ActivityItem = {
  id: string;
  kind: "automation" | "webhook";
  label: string;
  detail: string;
  success: boolean | "skipped";
  createdAt: Date;
};

async function loadJobStats(db: ScopedDb, scope: JobScope) {
  const since = new Date(Date.now() - TREND_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const [jobsByStatus, completedAgg, recentCompleted, ticketCount, needsReviewCount] = await Promise.all([
    db.job.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
    db.job.aggregate({ where: { ...scope, status: "COMPLETED" }, _sum: { revenue: true }, _count: true }),
    db.job.findMany({
      where: { ...scope, status: "COMPLETED", completedAt: { gte: since } },
      select: { completedAt: true, revenue: true },
    }),
    db.ticket.count(),
    db.ticket.count({ where: { confidence: { lt: LOW_CONFIDENCE_THRESHOLD } } }),
  ]);

  const countFor = (status: string) => jobsByStatus.find((g) => g.status === status)?._count._all ?? 0;

  const revenueByDay = new Map<string, number>();
  for (const job of recentCompleted) {
    if (!job.completedAt) continue;
    const key = job.completedAt.toISOString().slice(0, 10);
    revenueByDay.set(key, (revenueByDay.get(key) ?? 0) + Number(job.revenue ?? 0));
  }

  return {
    jobCount: jobsByStatus.reduce((sum, g) => sum + g._count._all, 0),
    openJobs: countFor("SCHEDULED") + countFor("IN_PROGRESS"),
    jobStatusData: JOB_STATUS_ORDER.map((status) => ({ status, count: countFor(status) })).filter((d) => d.count > 0),
    completedCount: completedAgg._count,
    completedRevenue: Number(completedAgg._sum.revenue ?? 0),
    revenueTrendData: Array.from(revenueByDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-7)
      .map(([date, revenue]) => ({ label: formatShortDate(date), revenue: Math.round(revenue * 100) / 100 })),
    ticketCount,
    needsReviewCount,
  };
}

async function loadAutomationStats(db: ScopedDb) {
  const [ruleCount, runsByOutcome, recentRuns, recentDeliveries, notifiedJobs] = await Promise.all([
    db.automationRule.count({ where: { isActive: true } }),
    db.automationRun.groupBy({ by: ["status"], _count: { _all: true } }),
    db.automationRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { rule: { select: { name: true } } },
    }),
    db.webhookDelivery.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { webhookConfig: { select: { targetUrl: true } } },
    }),
    // Jobs over $500 that a webhook was actually *delivered* for. Counting successful rule runs
    // instead would overstate it: a run is logged as a success even if the endpoint it fired at
    // was down, blocked, or didn't exist.
    db.webhookDelivery.groupBy({ by: ["jobId"], where: { success: true, job: { revenue: { gt: 500 } } } }),
  ]);

  const activity: ActivityItem[] = [
    ...recentRuns.map((run) => ({
      id: `run-${run.id}`,
      kind: "automation" as const,
      label: run.rule.name,
      detail: run.log ?? "",
      success: run.status === "SUCCESS" ? true : run.status === "SKIPPED" ? ("skipped" as const) : false,
      createdAt: run.createdAt,
    })),
    ...recentDeliveries.map((delivery) => ({
      id: `delivery-${delivery.id}`,
      kind: "webhook" as const,
      label: delivery.webhookConfig.targetUrl,
      detail: delivery.success
        ? [delivery.statusCode, delivery.durationMs !== null ? `${delivery.durationMs}ms` : null].filter(Boolean).join(" · ")
        : (delivery.errorMessage ?? "Failed"),
      success: delivery.success,
      createdAt: delivery.createdAt,
    })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 10);

  return {
    ruleCount,
    notifiedCount: notifiedJobs.length,
    activity,
    runOutcomeData: RUN_OUTCOME_ORDER.map((outcome) => ({
      outcome,
      label: RUN_OUTCOME_LABEL[outcome],
      count: runsByOutcome.find((g) => g.status === outcome)?._count._all ?? 0,
    })).filter((d) => d.count > 0),
  };
}

const GRID_COLS: Record<number, string> = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4" };

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) return null;
  const db = await getScopedDb();

  const isTechnician = session.role === "TECHNICIAN";
  const showAutomation = can(session.role, "view:automations");
  const showBriefings = can(session.role, "view:briefings");

  // A technician's numbers and charts reflect only their own assigned jobs — the same row-level
  // rule the Jobs page itself enforces. Automation history and briefings are org-wide management
  // views, so each is loaded only for roles the matrix (lib/authz.ts) grants it to.
  const scope: JobScope = isTechnician ? { assignedToId: session.userId } : {};

  const [jobs, automation, lastBriefing] = await Promise.all([
    loadJobStats(db, scope),
    showAutomation ? loadAutomationStats(db) : null,
    showBriefings ? db.dailyBriefing.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }) : null,
  ]);

  const stats = [
    { label: isTechnician ? "Your jobs" : "Total jobs", value: jobs.jobCount, icon: Briefcase },
    { label: "Open jobs", value: jobs.openJobs, icon: FolderClock },
    { label: "Tickets", value: jobs.ticketCount, icon: Ticket },
    ...(automation ? [{ label: "Active automation rules", value: automation.ruleCount, icon: Zap }] : []),
  ];

  const startItems = [
    {
      href: "/tickets",
      title: "Tickets",
      detail:
        jobs.needsReviewCount > 0
          ? `${plural(jobs.needsReviewCount, "ticket")} ${jobs.needsReviewCount === 1 ? "is" : "are"} marked “needs review” right now — the grounding safeguard catching a mismatch between the model's quoted evidence and the source text.`
          : "Classified with a source-grounded quote and a confidence score. Low-confidence or mis-grounded results are flagged for a human to check.",
    },
    {
      href: "/automations",
      title: "Automations",
      detail: "A real run history: matched, skipped by a filter, and the webhook it triggered.",
      show: showAutomation,
    },
    {
      href: "/briefings",
      title: "Briefings",
      detail: "An AI-written summary of the day's activity, checked so it doesn't state job counts or dollar amounts of its own.",
      show: showBriefings,
    },
    {
      href: "/jobs",
      title: "Jobs",
      detail: "Change a job's status. Completing one records the invoice total, which is what revenue-based rules evaluate.",
      show: !showAutomation,
    },
  ].filter((item) => item.show !== false);

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          A simulated scenario, driven by the app&apos;s real automation and AI functions.
        </p>
      </div>

      {/* Hero metric — the one number the eye should land on first */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
        <CardContent className="py-6">
          <p className="font-display text-4xl font-medium tracking-tight text-foreground sm:text-5xl">
            {plural(jobs.completedCount, "job")} completed
            <span className="text-primary"> · {formatCurrency(jobs.completedRevenue)}</span>
          </p>
          {automation && automation.notifiedCount > 0 ? (
            <p className="mt-1.5 text-sm text-muted-foreground">
              A notification webhook was delivered for {plural(automation.notifiedCount, "job")} that cleared $500 —
              nobody had to remember to check.
            </p>
          ) : isTechnician ? (
            <p className="mt-1.5 text-sm text-muted-foreground">Across the jobs assigned to you.</p>
          ) : null}
          {lastBriefing ? (
            <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
              <span className="mt-1 inline-flex size-2 shrink-0 rounded-full bg-primary" aria-hidden />
              <span>
                Latest briefing: {formatDateTime(lastBriefing.createdAt)}. A scheduled job generates new activity and
                a fresh briefing daily — see{" "}
                <Link href="/about" className="underline underline-offset-2 hover:text-foreground">
                  About
                </Link>
                .
              </span>
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-5">
          <p className="text-sm text-foreground">
            <span className="font-medium">{SCENARIO.company}</span> — {SCENARIO.description}
          </p>
          <p className="mt-2 text-sm text-foreground">
            Built to replace the two things that eat a small shop&apos;s time most: manually reading and sorting
            every incoming phone/chat/email message, and remembering to chase the jobs actually worth following up
            on.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            This isn&apos;t a mockup — the dates span a simulated month of business, but every classification,
            automation run, and briefing on it was produced by the app&apos;s real code, not written in by hand.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5 text-base">
            <Search className="size-4 text-primary" aria-hidden />
            Where to start
          </CardTitle>
        </CardHeader>
        <CardContent className={`grid gap-3 ${GRID_COLS[startItems.length] ?? "sm:grid-cols-3"}`}>
          {startItems.map((item, i) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex flex-col gap-1 rounded-lg border p-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                  {i + 1}
                </span>
                {item.title}
                <ArrowRight
                  className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                  aria-hidden
                />
              </span>
              <span className="text-xs text-muted-foreground">{item.detail}</span>
            </Link>
          ))}
        </CardContent>
      </Card>

      <div className={`grid grid-cols-2 gap-4 ${GRID_COLS[stats.length] ?? "sm:grid-cols-4"}`}>
        {stats.map((stat) => (
          <Card key={stat.label} className="transition-shadow hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
              <stat.icon className="size-4 text-primary" aria-hidden />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className={`grid gap-4 ${automation ? "sm:grid-cols-2" : ""}`}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{isTechnician ? "Your jobs by status" : "Jobs by status"}</CardTitle>
          </CardHeader>
          <CardContent>
            {jobs.jobStatusData.length > 0 ? (
              <JobsByStatusChart data={jobs.jobStatusData} />
            ) : (
              <p className="text-sm text-muted-foreground">No jobs yet.</p>
            )}
          </CardContent>
        </Card>
        {automation ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Automation run outcomes</CardTitle>
              <p className="text-xs text-muted-foreground">Every evaluation gets logged, matched or not.</p>
            </CardHeader>
            <CardContent>
              {automation.runOutcomeData.length > 0 ? (
                <AutomationOutcomesChart data={automation.runOutcomeData} />
              ) : (
                <p className="text-sm text-muted-foreground">No automation runs yet.</p>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>

      {jobs.revenueTrendData.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue by day</CardTitle>
            <p className="text-xs text-muted-foreground">Completed-job revenue, most recent days with activity.</p>
          </CardHeader>
          <CardContent>
            <RevenueTrendChart data={jobs.revenueTrendData} />
          </CardContent>
        </Card>
      ) : null}

      {automation ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
            <p className="text-xs text-muted-foreground">
              Automation runs and webhook deliveries — proof the engine actually ran, not just stat cards.
            </p>
          </CardHeader>
          <CardContent>
            {automation.activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <ul className="space-y-1">
                {automation.activity.map((item) => {
                  const StatusIcon =
                    item.success === true ? CheckCircle2 : item.success === "skipped" ? CircleDashed : XCircle;
                  const statusColor =
                    item.success === true
                      ? "text-[var(--chart-2)]"
                      : item.success === "skipped"
                        ? "text-muted-foreground"
                        : "text-destructive";
                  const statusText = item.success === true ? "Succeeded" : item.success === "skipped" ? "Skipped" : "Failed";
                  return (
                    <li key={item.id} className="flex items-center gap-2.5 rounded-md px-1 py-1.5 text-xs hover:bg-muted/40">
                      <StatusIcon className={`size-4 shrink-0 ${statusColor}`} aria-hidden />
                      <span className="sr-only">{statusText}:</span>
                      {item.kind === "webhook" ? (
                        <WebhookIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      ) : (
                        <Zap className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground">{item.label}</p>
                        <p className="truncate text-muted-foreground">{item.detail}</p>
                      </div>
                      <span className="shrink-0 text-muted-foreground">{formatDateTime(item.createdAt)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
