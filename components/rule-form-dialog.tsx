"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  createRule,
  updateRule,
  type RuleInput,
  type RuleFilterInput,
  type RuleActionInput,
} from "@/app/(app)/automations/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const JOB_STATUSES = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
const FIELDS_BY_TRIGGER: Record<string, string[]> = {
  "job.status_changed": ["revenue", "jobType", "status"],
  "ticket.created": ["priority", "source", "classification"],
};

type Props = {
  mode: "create" | "edit";
  ruleId?: string;
  initial?: RuleInput;
  trigger: React.ReactElement;
};

const EMPTY_RULE: RuleInput = {
  name: "",
  isActive: true,
  trigger: { type: "job.status_changed", status: "COMPLETED" },
  filters: [],
  actions: [{ type: "tag", value: "" }],
};

export function RuleFormDialog({ mode, ruleId, initial, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [rule, setRule] = useState<RuleInput>(initial ?? EMPTY_RULE);
  const [isPending, startTransition] = useTransition();

  function updateFilter(index: number, patch: Partial<RuleFilterInput>) {
    setRule((r) => ({
      ...r,
      filters: r.filters.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    }));
  }

  function updateAction(index: number, patch: Partial<RuleActionInput>) {
    setRule((r) => ({
      ...r,
      actions: r.actions.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    }));
  }

  function handleSubmit() {
    if (!rule.name.trim()) {
      toast.error("Give the rule a name.");
      return;
    }
    startTransition(async () => {
      if (mode === "create") {
        await createRule(rule);
        toast.success("Automation rule created.");
      } else if (ruleId) {
        await updateRule(ruleId, rule);
        toast.success("Automation rule updated.");
      }
      setOpen(false);
      if (mode === "create") setRule(EMPTY_RULE);
    });
  }

  const availableFields = FIELDS_BY_TRIGGER[rule.trigger.type] ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New automation rule" : "Edit automation rule"}</DialogTitle>
          <DialogDescription>
            Trigger → filter → action, evaluated every time a job changes status or a ticket is created.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label htmlFor="rule-name">Name</Label>
            <Input
              id="rule-name"
              value={rule.name}
              onChange={(e) => setRule((r) => ({ ...r, name: e.target.value }))}
              placeholder="e.g. Notify on job completion over $500"
            />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor="rule-active" className="text-sm font-normal">
              Active
            </Label>
            <Switch
              id="rule-active"
              checked={rule.isActive}
              onCheckedChange={(checked) => setRule((r) => ({ ...r, isActive: checked }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Trigger</Label>
            <div className="flex gap-2">
              <Select
                value={rule.trigger.type}
                onValueChange={(value) => {
                  if (!value) return;
                  setRule((r) => ({
                    ...r,
                    trigger: {
                      type: value as RuleInput["trigger"]["type"],
                      status: value === "job.status_changed" ? "COMPLETED" : undefined,
                    },
                    filters: [],
                  }));
                }}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="job.status_changed">Job status changed</SelectItem>
                  <SelectItem value="ticket.created">Ticket created</SelectItem>
                </SelectContent>
              </Select>
              {rule.trigger.type === "job.status_changed" ? (
                <Select
                  value={rule.trigger.status}
                  onValueChange={(value) => {
                    if (!value) return;
                    setRule((r) => ({ ...r, trigger: { ...r.trigger, status: value } }));
                  }}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {JOB_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Filters (all must match)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setRule((r) => ({
                    ...r,
                    filters: [...r.filters, { field: availableFields[0] ?? "", op: "eq", value: "" }],
                  }))
                }
              >
                <Plus className="size-3.5" /> Add filter
              </Button>
            </div>
            {rule.filters.length === 0 ? (
              <p className="text-xs text-muted-foreground">No filters, every trigger match fires.</p>
            ) : null}
            {rule.filters.map((filter, index) => (
              <div key={index} className="flex items-center gap-2">
                <Select
                  value={filter.field}
                  onValueChange={(value) => value && updateFilter(index, { field: value })}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFields.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={filter.op}
                  onValueChange={(value) => value && updateFilter(index, { op: value as RuleFilterInput["op"] })}
                >
                  <SelectTrigger className="w-[80px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eq">=</SelectItem>
                    <SelectItem value="gt">&gt;</SelectItem>
                    <SelectItem value="lt">&lt;</SelectItem>
                    <SelectItem value="gte">&gt;=</SelectItem>
                    <SelectItem value="lte">&lt;=</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  className="flex-1"
                  value={filter.value}
                  onChange={(e) => updateFilter(index, { value: e.target.value })}
                  placeholder="value"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setRule((r) => ({ ...r, filters: r.filters.filter((_, i) => i !== index) }))}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Actions</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRule((r) => ({ ...r, actions: [...r.actions, { type: "tag", value: "" }] }))}
              >
                <Plus className="size-3.5" /> Add action
              </Button>
            </div>
            {rule.actions.map((action, index) => (
              <div key={index} className="flex items-center gap-2">
                <Select
                  value={action.type}
                  onValueChange={(value) => value && updateAction(index, { type: value as RuleActionInput["type"] })}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tag">Tag</SelectItem>
                    <SelectItem value="webhook">Webhook</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  className="flex-1"
                  value={action.value ?? ""}
                  onChange={(e) => updateAction(index, { value: e.target.value })}
                  placeholder={action.type === "tag" ? "tag value" : "uses active webhook configs"}
                  disabled={action.type === "webhook"}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setRule((r) => ({ ...r, actions: r.actions.filter((_, i) => i !== index) }))}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Saving..." : mode === "create" ? "Create rule" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
