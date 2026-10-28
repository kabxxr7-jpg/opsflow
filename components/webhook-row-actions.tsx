"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import type { WebhookConfig } from "@prisma/client";
import { deleteWebhookConfig, toggleWebhookConfig, type WebhookConfigInput } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { WebhookFormDialog } from "@/components/webhook-form-dialog";

export function WebhookRowActions({ config }: { config: WebhookConfig }) {
  const [isPending, startTransition] = useTransition();

  const initial: WebhookConfigInput = {
    targetUrl: config.targetUrl,
    secret: config.secret,
    isActive: config.isActive,
    triggerOn: config.triggerOn,
  };

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={config.isActive}
        disabled={isPending}
        onCheckedChange={(checked) =>
          startTransition(async () => {
            await toggleWebhookConfig(config.id, checked);
          })
        }
      />
      <WebhookFormDialog
        mode="edit"
        configId={config.id}
        initial={initial}
        trigger={
          <Button type="button" variant="ghost" size="icon">
            <Pencil className="size-3.5" />
          </Button>
        }
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await deleteWebhookConfig(config.id);
            toast.success("Webhook endpoint deleted.");
          })
        }
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
