import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { RuleFormDialog } from "@/components/rule-form-dialog";
import { RuleRowActions } from "@/components/rule-row-actions";
import { formatDateTime } from "@/lib/utils";

const RUN_STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  SUCCESS: "default",
  SKIPPED: "secondary",
  FAILED: "destructive",
};

export default async function AutomationsPage() {
  const rules = await db.automationRule.findMany({
    orderBy: { createdAt: "desc" },
    include: { runs: { orderBy: { createdAt: "desc" }, take: 5 } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Automations</h1>
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
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No automation rules yet. Create one to get started.
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
                      {rule.runs.map((run) => (
                        <div key={run.id} className="flex items-center gap-2 text-xs">
                          <Badge variant={RUN_STATUS_VARIANT[run.status]} className="shrink-0">
                            {run.status}
                          </Badge>
                          <span className="text-muted-foreground">{run.log}</span>
                          <span className="ml-auto shrink-0 text-muted-foreground">
                            {formatDateTime(run.createdAt)}
                          </span>
                        </div>
                      ))}
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
