import type { Metadata } from "next";
import { CheckCircle2, CircleDashed, Plus, ShieldAlert, XCircle, Zap } from "lucide-react";
import { getScopedDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RuleFormDialog } from "@/components/rule-form-dialog";
import { RuleRowActions } from "@/components/rule-row-actions";
import { EmptyState } from "@/components/empty-state";
import { formatDateTime, JOB_STATUS_LABEL } from "@/lib/utils";

const RUN_STATUS_ICON: Record<string, { Icon: typeof CheckCircle2; color: string }> = {
  SUCCESS: { Icon: CheckCircle2, color: "text-[var(--chart-2)]" },
  SKIPPED: { Icon: CircleDashed, color: "text-muted-foreground" },
  FAILED: { Icon: XCircle, color: "text-destructive" },
};

export const metadata: Metadata = { title: "Automations" };

export default async function AutomationsPage() {
  const session = await getSession();
  if (!session) return null;
  if (session.role !== "OWNER") {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <ShieldAlert className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Automations are visible to the account owner only.
        </p>
      </div>
    );
  }
  const db = await getScopedDb();
  const rules = await db.automationRule.findMany({
    orderBy: { createdAt: "desc" },
    include: { runs: { orderBy: { createdAt: "desc" }, take: 5 } },
  });

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl font-medium tracking-tight">
            <Zap className="size-7 text-primary" aria-hidden />
            Automations
          </h1>
          <p className="text-sm text-muted-foreground">
            Trigger → filter → action rules, evaluated on every job status change and new ticket.
          </p>
        </div>
        <RuleFormDialog
          mode="create"
          trigger={
            <Button size="sm">
              <Plus className="size-3.5" /> New rule
            </Button>
          }
        />
      </div>

      {rules.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState message="No automation rules yet. Create one to get started." />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => {
            const trigger = rule.trigger as { type?: string; status?: string };
            const triggerText =
              trigger.type === "ticket.created"
                ? "When a ticket is created"
                : trigger.type === "job.status_changed"
                  ? trigger.status
                    ? `When a job becomes ${JOB_STATUS_LABEL[trigger.status as keyof typeof JOB_STATUS_LABEL]?.toLowerCase() ?? trigger.status}`
                    : "When a job's status changes"
                  : "Unrecognised trigger";
            return (
              <Card key={rule.id}>
                <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
                  <div>
                    <CardTitle className="text-base">{rule.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{triggerText}</p>
                  </div>
                  <RuleRowActions rule={rule} />
                </CardHeader>
                <CardContent>
                  {rule.runs.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No runs yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Recent runs</p>
                      {rule.runs.map((run) => {
                        const { Icon, color } = RUN_STATUS_ICON[run.status] ?? RUN_STATUS_ICON.SKIPPED;
                        return (
                          <div key={run.id} className="flex items-center gap-2 text-xs">
                            <Icon className={`size-4 shrink-0 ${color}`} aria-hidden />
                            <span className="sr-only">{run.status.toLowerCase()}:</span>
                            <span className="text-muted-foreground">{run.log}</span>
                            <span className="ml-auto shrink-0 text-muted-foreground">
                              {formatDateTime(run.createdAt)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
