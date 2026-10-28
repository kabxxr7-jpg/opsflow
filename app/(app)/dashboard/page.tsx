import Link from "next/link";
import { ArrowRight, Briefcase, FolderClock, Search, Ticket, Zap } from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { SCENARIO } from "@/lib/scenario";
import { JobsByStatusChart } from "@/components/jobs-by-status-chart";
import { AutomationOutcomesChart } from "@/components/automation-outcomes-chart";

const JOB_STATUS_ORDER = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
const RUN_OUTCOME_ORDER = ["SUCCESS", "SKIPPED", "FAILED"];

function startHere(hasNeedsReview: boolean) {
  return [
    {
      href: "/tickets",
      title: "Tickets",
      detail: hasNeedsReview
        ? "One ticket is marked “needs review” right now — that's the grounding safeguard catching a real mismatch between the model's claimed quote and the source text, not a staged example."
        : "Classified by Gemini with a source-grounded quote and confidence score on every ticket. Classification is a real, non-deterministic call each time — when the model's claimed quote doesn't actually match the source, confidence is auto-capped and the ticket flagged, so that badge won't always be present, but the safeguard runs on every single ticket.",
    },
    {
      href: "/automations",
      title: "Automations",
      detail: "A real run history: matched, skipped by filter, and the webhook it triggered.",
    },
    {
      href: "/briefings",
      title: "Briefings",
      detail: "An AI-written summary of today's activity, generated at seed time, not hand-written.",
    },
  ];
}

type ActivityItem = {
  id: string;
  kind: "automation" | "webhook";
  label: string;
  detail: string;
  success: boolean | "skipped";
  createdAt: Date;
};

export default async function DashboardPage() {
  const [
    jobCount,
    openJobs,
    ticketCount,
    ruleCount,
    recentRuns,
    recentDeliveries,
    jobsByStatus,
    runsByOutcome,
    needsReviewCount,
  ] = await Promise.all([
    db.job.count(),
    db.job.count({ where: { status: { in: ["SCHEDULED", "IN_PROGRESS"] } } }),
    db.ticket.count(),
    db.automationRule.count({ where: { isActive: true } }),
    db.automationRun.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { rule: true } }),
    db.webhookDelivery.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { webhookConfig: true } }),
    db.job.groupBy({ by: ["status"], _count: { _all: true } }),
    db.automationRun.groupBy({ by: ["status"], _count: { _all: true } }),
    db.ticket.count({ where: { confidence: { lt: 0.5 } } }),
  ]);

  const jobStatusData = JOB_STATUS_ORDER.map((status) => ({
    status,
    count: jobsByStatus.find((g) => g.status === status)?._count._all ?? 0,
  })).filter((d) => d.count > 0);

  const runOutcomeData = RUN_OUTCOME_ORDER.map((outcome) => ({
    outcome,
    count: runsByOutcome.find((g) => g.status === outcome)?._count._all ?? 0,
  })).filter((d) => d.count > 0);

  const stats = [
    { label: "Total jobs", value: jobCount, icon: Briefcase },
    { label: "Open jobs", value: openJobs, icon: FolderClock },
    { label: "Tickets", value: ticketCount, icon: Ticket },
    { label: "Active automation rules", value: ruleCount, icon: Zap },
  ];

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
        ? `Delivered, ${delivery.statusCode}, ${delivery.durationMs}ms`
        : (delivery.errorMessage ?? "Failed"),
      success: delivery.success,
      createdAt: delivery.createdAt,
    })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 10);

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          A simulated scenario, driven by the app&apos;s real automation and AI functions.
        </p>
      </div>

      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="py-5">
          <p className="text-sm text-foreground">
            <span className="font-medium">{SCENARIO.company}</span> — {SCENARIO.description}
          </p>
          <p className="mt-2 text-sm text-foreground">
            Built to replace the two things that eat a small shop&apos;s time most: manually
            reading and sorting every incoming phone/chat/email message, and remembering to
            chase the jobs actually worth following up on.
          </p>
          <p className="mt-2 text-sm font-medium text-foreground">
            This isn&apos;t a mockup — every number below was generated today, by the same AI and
            automation code a real deployment would run.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5 text-base">
            <Search className="size-4 text-primary" aria-hidden />
            New here? Start with these three
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {startHere(needsReviewCount > 0).map((item, i) => (
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
                <ArrowRight className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
              </span>
              <span className="text-xs text-muted-foreground">{item.detail}</span>
            </Link>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="transition-shadow hover:shadow-md">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className="size-4 text-primary" aria-hidden />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Jobs by status</CardTitle>
          </CardHeader>
          <CardContent>
            {jobStatusData.length > 0 ? (
              <JobsByStatusChart data={jobStatusData} />
            ) : (
              <p className="text-sm text-muted-foreground">No jobs yet.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Automation run outcomes</CardTitle>
            <p className="text-xs text-muted-foreground">
              Every evaluation gets logged, matched or not.
            </p>
          </CardHeader>
          <CardContent>
            {runOutcomeData.length > 0 ? (
              <AutomationOutcomesChart data={runOutcomeData} />
            ) : (
              <p className="text-sm text-muted-foreground">No automation runs yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent activity</CardTitle>
          <p className="text-xs text-muted-foreground">
            Automation runs and webhook deliveries, proof the engine actually ran, not just stat
            cards.
          </p>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <div className="space-y-2">
              {activity.map((item) => (
                <div key={item.id} className="flex items-start gap-2 text-xs">
                  <Badge
                    variant={item.success === true ? "default" : item.success === "skipped" ? "secondary" : "destructive"}
                    className="shrink-0"
                  >
                    {item.kind === "automation" ? "rule" : "webhook"}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{item.label}</p>
                    <p className="truncate text-muted-foreground">{item.detail}</p>
                  </div>
                  <span className="shrink-0 text-muted-foreground">{formatDateTime(item.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
