import { CheckCircle2, CircleDashed, Plus, XCircle, Zap } from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RuleFormDialog } from "@/components/rule-form-dialog";
import { RuleRowActions } from "@/components/rule-row-actions";
import { EmptyState } from "@/components/empty-state";
import { formatDateTime } from "@/lib/utils";

const RUN_STATUS_ICON: Record<string, { Icon: typeof CheckCircle2; color: string }> = {
  SUCCESS: { Icon: CheckCircle2, color: "text-[var(--chart-2)]" },
  SKIPPED: { Icon: CircleDashed, color: "text-muted-foreground" },
  FAILED: { Icon: XCircle, color: "text-destructive" },
};

export default async function AutomationsPage() {
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
            const trigger = rule.trigger as { type: string; status?: string };
            return (
              <Card key={rule.id}>
                <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">{rule.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {trigger.type}
                      {trigger.status ? ` → ${trigger.status}` : ""}
                    </p>
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
