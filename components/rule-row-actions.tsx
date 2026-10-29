"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import type { AutomationRule } from "@prisma/client";
import { deleteRule, toggleRule, type RuleInput } from "@/app/(app)/automations/actions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RuleFormDialog } from "@/components/rule-form-dialog";

export function RuleRowActions({ rule }: { rule: AutomationRule }) {
  const [isPending, startTransition] = useTransition();
  const [active, setActive] = useOptimistic(rule.isActive);

  const initial: RuleInput = {
    name: rule.name,
    isActive: rule.isActive,
    trigger: rule.trigger as unknown as RuleInput["trigger"],
    filters: ((rule.filters as unknown as RuleInput["filters"]) ?? []).map((f) => ({ ...f, value: String(f.value) })),
    actions: (rule.actions as unknown as RuleInput["actions"]) ?? [],
  };

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={active}
        disabled={isPending}
        aria-label={`${active ? "Pause" : "Activate"} rule ${rule.name}`}
        onCheckedChange={(checked) =>
          startTransition(async () => {
            setActive(checked);
            const result = await toggleRule(rule.id, checked);
            if (result.error) toast.error(result.error);
          })
        }
      />
      <RuleFormDialog
        mode="edit"
        ruleId={rule.id}
        initial={initial}
        trigger={
          <Button type="button" variant="ghost" size="icon" aria-label={`Edit rule ${rule.name}`}>
            <Pencil className="size-3.5" aria-hidden />
          </Button>
        }
      />
      <ConfirmDialog
        title={`Delete “${rule.name}”?`}
        description="This also deletes the rule's run history. This can't be undone."
        confirmLabel="Delete rule"
        successMessage="Rule deleted."
        onConfirm={() => deleteRule(rule.id)}
        trigger={
          <Button type="button" variant="ghost" size="icon" aria-label={`Delete rule ${rule.name}`}>
            <Trash2 className="size-3.5" aria-hidden />
          </Button>
        }
      />
    </div>
  );
}
