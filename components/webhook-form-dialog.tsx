"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { JobStatus } from "@prisma/client";
import {
  createWebhookConfig,
  updateWebhookConfig,
  type WebhookConfigInput,
} from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { JOB_STATUS_LABEL } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const JOB_STATUSES: JobStatus[] = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

const EMPTY: WebhookConfigInput = {
  targetUrl: "",
  secret: "",
  isActive: true,
  triggerOn: ["COMPLETED"],
};

type Props = {
  mode: "create" | "edit";
  configId?: string;
  initial?: WebhookConfigInput;
  trigger: React.ReactElement;
};

export function WebhookFormDialog({ mode, configId, initial, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<WebhookConfigInput>(initial ?? EMPTY);
  const [isPending, startTransition] = useTransition();

  function toggleStatus(status: JobStatus, checked: boolean) {
    setConfig((c) => ({
      ...c,
      triggerOn: checked ? [...c.triggerOn, status] : c.triggerOn.filter((s) => s !== status),
    }));
  }

  function handleSubmit() {
    if (!config.targetUrl.trim() || !config.secret.trim()) {
      toast.error("Target URL and secret are both required.");
      return;
    }
    startTransition(async () => {
      if (mode === "create") {
        await createWebhookConfig(config);
        toast.success("Webhook endpoint created.");
      } else if (configId) {
        await updateWebhookConfig(configId, config);
        toast.success("Webhook endpoint updated.");
      }
      setOpen(false);
      if (mode === "create") setConfig(EMPTY);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New webhook endpoint" : "Edit webhook endpoint"}</DialogTitle>
          <DialogDescription>
            Fires a signed POST when a job reaches one of the selected statuses.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="targetUrl">Target URL</Label>
            <Input
              id="targetUrl"
              value={config.targetUrl}
              onChange={(e) => setConfig((c) => ({ ...c, targetUrl: e.target.value }))}
              placeholder="https://example.com/webhooks/opsflow"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="secret">Signing secret</Label>
            <Input
              id="secret"
              value={config.secret}
              onChange={(e) => setConfig((c) => ({ ...c, secret: e.target.value }))}
              placeholder="Shared secret used to HMAC-sign deliveries"
            />
          </div>
          <div className="space-y-2">
            <Label>Fires on job status</Label>
            <div className="flex flex-wrap gap-3">
              {JOB_STATUSES.map((status) => (
                <label key={status} className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={config.triggerOn.includes(status)}
                    onCheckedChange={(checked) => toggleStatus(status, checked === true)}
                  />
                  {JOB_STATUS_LABEL[status]}
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor="webhook-active" className="text-sm font-normal">
              Active
            </Label>
            <Switch
              id="webhook-active"
              checked={config.isActive}
              onCheckedChange={(checked) => setConfig((c) => ({ ...c, isActive: checked }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Saving..." : mode === "create" ? "Create endpoint" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
