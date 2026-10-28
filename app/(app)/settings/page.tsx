import { CheckCircle2, Info, Plus, Settings as SettingsIcon, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { EmptyState } from "@/components/empty-state";
import { formatDateTime, JOB_STATUS_LABEL } from "@/lib/utils";
import { WebhookFormDialog } from "@/components/webhook-form-dialog";
import { WebhookRowActions } from "@/components/webhook-row-actions";

export default async function SettingsPage() {
  const webhooks = await db.webhookConfig.findMany({
    orderBy: { createdAt: "desc" },
    include: { deliveries: { orderBy: { createdAt: "desc" }, take: 5 } },
  });

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl font-medium tracking-tight">
            <SettingsIcon className="size-7 text-primary" aria-hidden />
            Settings
          </h1>
          <p className="text-sm text-muted-foreground">
            Outbound webhook configuration, HMAC signing, and delivery history.
          </p>
        </div>
        <WebhookFormDialog
          mode="create"
          trigger={
            <Button size="sm">
              <Plus className="size-3.5" /> New endpoint
            </Button>
          }
        />
      </div>
      {webhooks.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState message="No webhook endpoints configured yet." />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {webhooks.map((hook) => (
            <Card key={hook.id}>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <code className="truncate rounded-md bg-muted px-2 py-1 font-mono text-xs text-foreground">
                      {hook.targetUrl}
                    </code>
                    <CopyButton value={hook.targetUrl} />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Fires on: {hook.triggerOn.map((s) => JOB_STATUS_LABEL[s]).join(", ") || "nothing configured"}
                  </p>
                  {hook.targetUrl.includes("/api/integrations/test-echo") ? (
                    <div className="mt-2 flex items-start gap-2 rounded-md border bg-accent/50 p-2.5 text-xs text-accent-foreground">
                      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      <p>
                        Points at this app&apos;s own signed receiver on purpose — it proves the
                        full sign → deliver → verify round-trip without depending on a third-party
                        service staying up. In a real deployment this field points at your CRM,
                        Slack, or Zapier instead; nothing about the delivery code changes.
                      </p>
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge variant={hook.isActive ? "default" : "outline"}>
                    {hook.isActive ? "Active" : "Paused"}
                  </Badge>
                  <WebhookRowActions config={hook} />
                </div>
              </CardHeader>
              <CardContent>
                {hook.deliveries.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No deliveries yet.</p>
                ) : (
                  <div className="space-y-0.5">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Recent deliveries</p>
                    <div className="relative space-y-3 border-l pl-4">
                      {hook.deliveries.map((d) => (
                        <div key={d.id} className="relative text-xs">
                          <span
                            className={`absolute top-0.5 -left-[21px] flex size-3 items-center justify-center rounded-full ${
                              d.success ? "bg-[var(--chart-2)]" : "bg-destructive"
                            }`}
                          >
                            {d.success ? (
                              <CheckCircle2 className="size-3 text-white" />
                            ) : (
                              <XCircle className="size-3 text-white" />
                            )}
                          </span>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-foreground">
                              attempt {d.attemptNumber}
                            </span>
                            <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-muted-foreground">
                              {d.statusCode ?? "no response"}
                              {d.durationMs !== null ? ` · ${d.durationMs}ms` : ""}
                            </span>
                            {d.errorMessage ? (
                              <span className="text-destructive">{d.errorMessage}</span>
                            ) : null}
                            <span className="ml-auto text-muted-foreground">{formatDateTime(d.createdAt)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
