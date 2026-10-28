"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import type { AutomationRule } from "@prisma/client";
import { deleteRule, toggleRule, type RuleInput } from "@/app/(app)/automations/actions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { RuleFormDialog } from "@/components/rule-form-dialog";

export function RuleRowActions({ rule }: { rule: AutomationRule }) {
  const [isPending, startTransition] = useTransition();

  const initial: RuleInput = {
    name: rule.name,
    isActive: rule.isActive,
    trigger: rule.trigger as unknown as RuleInput["trigger"],
    filters: (rule.filters as unknown as RuleInput["filters"]) ?? [],
    actions: (rule.actions as unknown as RuleInput["actions"]) ?? [],
  };

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={rule.isActive}
        disabled={isPending}
        onCheckedChange={(checked) =>
          startTransition(async () => {
            await toggleRule(rule.id, checked);
          })
        }
      />
      <RuleFormDialog
        mode="edit"
        ruleId={rule.id}
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
            await deleteRule(rule.id);
            toast.success("Rule deleted.");
          })
        }
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
