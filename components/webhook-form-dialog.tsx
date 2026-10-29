"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import type { JobStatus } from "@prisma/client";
import {
  createWebhookConfig,
  updateWebhookConfig,
  type WebhookConfigInput,
} from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/form-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { JOB_STATUSES, LIMITS } from "@/lib/rule-fields";
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

/** What the edit form needs. Deliberately has no `secret`: it's write-only and never leaves the server. */
export type WebhookFormInitial = Omit<WebhookConfigInput, "secret">;

const EMPTY: WebhookFormInitial = {
  targetUrl: "",
  isActive: true,
  triggerOn: ["COMPLETED"],
};

type Props = {
  mode: "create" | "edit";
  configId?: string;
  initial?: WebhookFormInitial;
  trigger: React.ReactElement;
};

function generateSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `whsec_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function WebhookFormDialog({ mode, configId, initial, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<WebhookFormInitial>(initial ?? EMPTY);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const idPrefix = configId ?? "new";

  function handleOpenChange(next: boolean) {
    if (next) {
      // Every open starts from the saved state, so a half-typed edit that was dismissed doesn't
      // reappear — and the secret field never carries a value over.
      setConfig(initial ?? EMPTY);
      setSecret("");
      setError(null);
    }
    setOpen(next);
  }

  function toggleStatus(status: JobStatus, checked: boolean) {
    setConfig((c) => ({
      ...c,
      triggerOn: checked ? [...new Set([...c.triggerOn, status])] : c.triggerOn.filter((s) => s !== status),
    }));
  }

  function validate(): string | null {
    if (!config.targetUrl.trim()) return "Enter the URL to send events to.";
    if (mode === "create" && !secret.trim()) return "Add a signing secret (or generate one).";
    if (secret && secret.length < LIMITS.secretMin) {
      return `Use a signing secret of at least ${LIMITS.secretMin} characters.`;
    }
    if (config.triggerOn.length === 0) return "Pick at least one job status to fire on.";
    return null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    const payload: WebhookConfigInput = { ...config, secret: secret || undefined };
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createWebhookConfig(payload)
          : configId
            ? await updateWebhookConfig(configId, payload)
            : { error: "Missing endpoint id." };
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success(mode === "create" ? "Webhook endpoint created." : "Webhook endpoint updated.");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New webhook endpoint" : "Edit webhook endpoint"}</DialogTitle>
          <DialogDescription>
            Fires a signed POST when a job reaches one of the selected statuses.
          </DialogDescription>
        </DialogHeader>
        <form id={`webhook-form-${idPrefix}`} onSubmit={handleSubmit} noValidate className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-targetUrl`}>Target URL</Label>
            <Input
              id={`${idPrefix}-targetUrl`}
              value={config.targetUrl}
              onChange={(e) => setConfig((c) => ({ ...c, targetUrl: e.target.value }))}
              placeholder="https://example.com/webhooks/opsflow"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              maxLength={LIMITS.url}
            />
            <p className="text-xs text-muted-foreground">
              Must be a public https address — private, internal and cloud-metadata addresses are refused.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-secret`}>Signing secret</Label>
            <div className="flex gap-2">
              <Input
                id={`${idPrefix}-secret`}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={mode === "edit" ? "Leave blank to keep the current secret" : "Shared secret used to HMAC-sign deliveries"}
                autoComplete="off"
                spellCheck={false}
                maxLength={LIMITS.secretMax}
                className="font-mono"
              />
              <Button type="button" variant="outline" onClick={() => setSecret(generateSecret())}>
                <KeyRound className="size-3.5" aria-hidden /> Generate
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {mode === "edit"
                ? "Secrets are write-only: the stored one is never shown again. Enter a new one only to rotate it."
                : "Copy it into the receiving service now — once saved, it can't be viewed again."}
            </p>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Fires on job status</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {JOB_STATUSES.map((status) => (
                <label key={status} className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    aria-label={JOB_STATUS_LABEL[status]}
                    checked={config.triggerOn.includes(status)}
                    onCheckedChange={(checked) => toggleStatus(status, checked === true)}
                  />
                  {JOB_STATUS_LABEL[status]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor={`${idPrefix}-active`} className="text-sm font-normal">
              Active
            </Label>
            <Switch
              id={`${idPrefix}-active`}
              aria-label="Active"
              checked={config.isActive}
              onCheckedChange={(checked) => setConfig((c) => ({ ...c, isActive: checked }))}
            />
          </div>
          <FormError>{error}</FormError>
        </form>
        <DialogFooter>
          <Button type="submit" form={`webhook-form-${idPrefix}`} disabled={isPending}>
            {isPending ? "Saving…" : mode === "create" ? "Create endpoint" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
