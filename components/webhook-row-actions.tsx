"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import type { JobStatus } from "@prisma/client";
import { deleteWebhookConfig, toggleWebhookConfig } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { WebhookFormDialog } from "@/components/webhook-form-dialog";

/** The only fields of a webhook the browser ever receives — notably not `secret`. */
export type WebhookView = {
  id: string;
  targetUrl: string;
  isActive: boolean;
  triggerOn: JobStatus[];
};

export function WebhookRowActions({ config }: { config: WebhookView }) {
  const [isPending, startTransition] = useTransition();
  const [active, setActive] = useOptimistic(config.isActive);

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={active}
        disabled={isPending}
        aria-label={`${active ? "Pause" : "Activate"} endpoint ${config.targetUrl}`}
        onCheckedChange={(checked) =>
          startTransition(async () => {
            setActive(checked);
            const result = await toggleWebhookConfig(config.id, checked);
            if (result.error) toast.error(result.error);
          })
        }
      />
      <WebhookFormDialog
        mode="edit"
        configId={config.id}
        initial={{ targetUrl: config.targetUrl, isActive: config.isActive, triggerOn: config.triggerOn }}
        trigger={
          <Button type="button" variant="ghost" size="icon" aria-label={`Edit endpoint ${config.targetUrl}`}>
            <Pencil className="size-3.5" aria-hidden />
          </Button>
        }
      />
      <ConfirmDialog
        title="Delete this endpoint?"
        description="This also deletes its delivery history. Nothing further will be sent to it. This can't be undone."
        confirmLabel="Delete endpoint"
        successMessage="Webhook endpoint deleted."
        onConfirm={() => deleteWebhookConfig(config.id)}
        trigger={
          <Button type="button" variant="ghost" size="icon" aria-label={`Delete endpoint ${config.targetUrl}`}>
            <Trash2 className="size-3.5" aria-hidden />
          </Button>
        }
      />
    </div>
  );
}
