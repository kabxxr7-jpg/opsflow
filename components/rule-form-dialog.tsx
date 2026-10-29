"use client";

import { useId, useState, useTransition } from "react";
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
import { FormError } from "@/components/form-error";
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
import { FIELDS_BY_TRIGGER, FIELD_LABEL, JOB_STATUSES, LIMITS, NUMERIC_FIELDS } from "@/lib/rule-fields";
import { JOB_STATUS_LABEL } from "@/lib/utils";

const TRIGGER_ITEMS = {
  "job.status_changed": "Job status changed",
  "ticket.created": "Ticket created",
};
const STATUS_ITEMS: Record<string, string> = {
  any: "Any status",
  ...Object.fromEntries(JOB_STATUSES.map((s) => [s, JOB_STATUS_LABEL[s]])),
};
const OP_SYMBOL: Record<RuleFilterInput["op"], string> = { eq: "=", gt: ">", lt: "<", gte: "≥", lte: "≤" };
const ACTION_ITEMS = { tag: "Tag", webhook: "Webhook" };

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

function validate(rule: RuleInput): string | null {
  if (!rule.name.trim()) return "Give the rule a name.";
  for (const f of rule.filters) {
    const label = FIELD_LABEL[f.field] ?? f.field;
    if (!f.value.trim()) return `Enter a value for the ${label} filter.`;
    if (f.op !== "eq" && !Number.isFinite(Number(f.value))) {
      return `"${f.value}" isn't a number — the ${label} filter needs one.`;
    }
  }
  if (rule.actions.length === 0) return "Add at least one action.";
  if (rule.actions.some((a) => a.type === "tag" && !(a.value ?? "").trim())) return "Give each tag action a value.";
  return null;
}

export function RuleFormDialog({ mode, ruleId, initial, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [rule, setRule] = useState<RuleInput>(initial ?? EMPTY_RULE);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const uid = useId();

  function handleOpenChange(next: boolean) {
    if (next) {
      // Always start from the saved rule (or a blank one) — never from a dismissed half-edit.
      setRule(initial ?? EMPTY_RULE);
      setError(null);
    }
    setOpen(next);
  }

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validate(rule);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    const payload: RuleInput = {
      ...rule,
      name: rule.name.trim(),
      actions: rule.actions.map((a) => (a.type === "tag" ? { type: "tag", value: (a.value ?? "").trim() } : { type: "webhook" })),
    };
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createRule(payload)
          : ruleId
            ? await updateRule(ruleId, payload)
            : { error: "Missing rule id." };
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success(mode === "create" ? "Automation rule created." : "Automation rule updated.");
      setOpen(false);
    });
  }

  const availableFields = FIELDS_BY_TRIGGER[rule.trigger.type] ?? [];
  const fieldItems = Object.fromEntries(availableFields.map((f) => [f, FIELD_LABEL[f] ?? f]));
  const formId = `${uid}-rule-form`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New automation rule" : "Edit automation rule"}</DialogTitle>
          <DialogDescription>
            Trigger → filter → action, evaluated every time a job changes status or a ticket is created.
          </DialogDescription>
        </DialogHeader>

        <form id={formId} onSubmit={handleSubmit} noValidate className="space-y-5 py-2">
          <div className="space-y-2">
            <Label htmlFor={`${uid}-name`}>Name</Label>
            <Input
              id={`${uid}-name`}
              value={rule.name}
              onChange={(e) => setRule((r) => ({ ...r, name: e.target.value }))}
              placeholder="e.g. Notify on job completion over $500"
              maxLength={LIMITS.ruleName}
              autoComplete="off"
            />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor={`${uid}-active`} className="text-sm font-normal">
              Active
            </Label>
            <Switch
              id={`${uid}-active`}
              aria-label="Active"
              checked={rule.isActive}
              onCheckedChange={(checked) => setRule((r) => ({ ...r, isActive: checked }))}
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Trigger</legend>
            <div className="flex gap-2">
              <Select
                items={TRIGGER_ITEMS}
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
                <SelectTrigger className="flex-1" aria-label="Trigger event">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="job.status_changed">Job status changed</SelectItem>
                  <SelectItem value="ticket.created">Ticket created</SelectItem>
                </SelectContent>
              </Select>
              {rule.trigger.type === "job.status_changed" ? (
                <Select
                  items={STATUS_ITEMS}
                  value={rule.trigger.status ?? "any"}
                  onValueChange={(value) => {
                    if (!value) return;
                    setRule((r) => ({ ...r, trigger: { type: r.trigger.type, status: value === "any" ? undefined : value } }));
                  }}
                >
                  <SelectTrigger className="flex-1" aria-label="Job status that triggers the rule">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any status</SelectItem>
                    {JOB_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {JOB_STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          </fieldset>

          <div role="group" aria-label="Filters" className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Filters (all must match)</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={rule.filters.length >= LIMITS.maxFilters}
                onClick={() =>
                  setRule((r) => ({
                    ...r,
                    filters: [...r.filters, { field: availableFields[0] ?? "", op: "eq", value: "" }],
                  }))
                }
              >
                <Plus className="size-3.5" aria-hidden /> Add filter
              </Button>
            </div>
            {rule.filters.length === 0 ? (
              <p className="text-xs text-muted-foreground">No filters — every trigger match fires.</p>
            ) : null}
            {rule.filters.map((filter, index) => {
              const numeric = NUMERIC_FIELDS.includes(filter.field);
              const opItems = numeric ? OP_SYMBOL : { eq: OP_SYMBOL.eq };
              return (
                <div key={index} className="flex flex-wrap items-center gap-2">
                  <Select
                    items={fieldItems}
                    value={filter.field}
                    onValueChange={(value) => {
                      if (!value) return;
                      updateFilter(index, {
                        field: value,
                        // Ordering operators only mean something for numbers.
                        op: NUMERIC_FIELDS.includes(value) ? filter.op : "eq",
                      });
                    }}
                  >
                    <SelectTrigger className="w-[130px]" aria-label={`Filter ${index + 1} field`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableFields.map((f) => (
                        <SelectItem key={f} value={f}>
                          {FIELD_LABEL[f] ?? f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    items={opItems}
                    value={filter.op}
                    onValueChange={(value) => value && updateFilter(index, { op: value as RuleFilterInput["op"] })}
                  >
                    <SelectTrigger className="w-[72px]" aria-label={`Filter ${index + 1} comparison`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(opItems) as RuleFilterInput["op"][]).map((op) => (
                        <SelectItem key={op} value={op}>
                          {OP_SYMBOL[op]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="min-w-[7rem] flex-1"
                    value={filter.value}
                    onChange={(e) => updateFilter(index, { value: e.target.value })}
                    placeholder={numeric ? "e.g. 500" : "e.g. URGENT"}
                    aria-label={`Filter ${index + 1} value`}
                    maxLength={LIMITS.filterValue}
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove filter ${index + 1}`}
                    onClick={() => setRule((r) => ({ ...r, filters: r.filters.filter((_, i) => i !== index) }))}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </div>
              );
            })}
          </div>

          <div role="group" aria-label="Actions" className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Actions</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={rule.actions.length >= LIMITS.maxActions}
                onClick={() => setRule((r) => ({ ...r, actions: [...r.actions, { type: "tag", value: "" }] }))}
              >
                <Plus className="size-3.5" aria-hidden /> Add action
              </Button>
            </div>
            {rule.actions.map((action, index) => (
              <div key={index} className="flex items-center gap-2">
                <Select
                  items={ACTION_ITEMS}
                  value={action.type}
                  onValueChange={(value) => value && updateAction(index, { type: value as RuleActionInput["type"] })}
                >
                  <SelectTrigger className="w-[120px]" aria-label={`Action ${index + 1} type`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tag">Tag</SelectItem>
                    <SelectItem value="webhook">Webhook</SelectItem>
                  </SelectContent>
                </Select>
                {action.type === "webhook" ? (
                  <p className="min-w-0 flex-1 text-sm text-muted-foreground">Sends to your active webhook endpoints</p>
                ) : (
                  <Input
                    className="min-w-0 flex-1"
                    value={action.value ?? ""}
                    onChange={(e) => updateAction(index, { value: e.target.value })}
                    placeholder="tag value"
                    aria-label={`Action ${index + 1} tag value`}
                    maxLength={LIMITS.tagValue}
                    autoComplete="off"
                  />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove action ${index + 1}`}
                  onClick={() => setRule((r) => ({ ...r, actions: r.actions.filter((_, i) => i !== index) }))}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </div>
            ))}
          </div>

          <FormError>{error}</FormError>
        </form>

        <DialogFooter>
          <Button type="submit" form={formId} disabled={isPending}>
            {isPending ? "Saving…" : mode === "create" ? "Create rule" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
