import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
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
          <h1 className="font-display text-3xl font-medium tracking-tight">Settings</h1>
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
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No webhook endpoints configured yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {webhooks.map((hook) => (
            <Card key={hook.id}>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="font-mono text-sm">{hook.targetUrl}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Fires on: {hook.triggerOn.map((s) => JOB_STATUS_LABEL[s]).join(", ") || "nothing configured"}
                  </p>
                  {hook.targetUrl.includes("/api/integrations/test-echo") ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Points at this app&apos;s own signed receiver on purpose — it proves the full
                      sign → deliver → verify round-trip without depending on a third-party service
                      staying up. In a real deployment this field points at your CRM, Slack, or
                      Zapier instead; nothing about the delivery code changes.
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
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
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Recent deliveries</p>
                    {hook.deliveries.map((d) => (
                      <div key={d.id} className="flex items-center gap-2 text-xs">
                        <Badge variant={d.success ? "default" : "destructive"} className="shrink-0">
                          {d.success ? "delivered" : "failed"}
                        </Badge>
                        <span className="text-muted-foreground">
                          attempt {d.attemptNumber} · {d.statusCode ?? "no response"} ·{" "}
                          {d.durationMs !== null ? `${d.durationMs}ms` : "—"}
                          {d.errorMessage ? ` · ${d.errorMessage}` : ""}
                        </span>
                        <span className="ml-auto shrink-0 text-muted-foreground">
                          {formatDateTime(d.createdAt)}
                        </span>
                      </div>
                    ))}
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
