"use client";

import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import type { JobStatus } from "@prisma/client";
import { updateJobStatus } from "@/app/(app)/jobs/actions";
import { JOB_STATUSES } from "@/lib/rule-fields";
import { JOB_STATUS_LABEL } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/form-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  jobId: string;
  status: JobStatus;
  /** Current invoice total as a plain string (a Prisma Decimal can't cross into a client component). */
  revenue: string | null;
  /** Human description of the job, used to label the control for assistive tech. */
  label: string;
};

function parseAmount(text: string): { value: number | undefined; error: string | null } {
  const cleaned = text.replace(/[$,\s]/g, "");
  if (cleaned === "") return { value: undefined, error: null };
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return { value: undefined, error: "Enter the amount as a positive number, e.g. 540.00." };
  return { value, error: null };
}

export function JobStatusSelect({ jobId, status, revenue, label }: Props) {
  const [isPending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(status);
  const [completing, setCompleting] = useState(false);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(next: JobStatus, invoice?: number) {
    return startTransition(async () => {
      setShown(next);
      const result = await updateJobStatus(jobId, next, invoice);
      if (result.error) {
        // The optimistic value rolls back on its own when this transition ends.
        if (completing) setError(result.error);
        else toast.error(result.error);
        return;
      }
      setCompleting(false);
      toast.success(`Job marked ${JOB_STATUS_LABEL[next].toLowerCase()}.`);
    });
  }

  function handleChange(value: string | null) {
    if (!value || value === status) return;
    const next = value as JobStatus;
    if (next === "COMPLETED") {
      // Completing is the one transition that has data worth capturing: the invoice total is what
      // revenue-based automation rules evaluate.
      setAmount(revenue ?? "");
      setError(null);
      setCompleting(true);
      return;
    }
    submit(next);
  }

  function handleComplete(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseAmount(amount);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    setError(null);
    submit("COMPLETED", parsed.value);
  }

  return (
    <>
      <Select value={shown} disabled={isPending} onValueChange={handleChange}>
        <SelectTrigger size="sm" className="w-[140px]" aria-label={`Status for ${label}`}>
          <SelectValue>{(value: JobStatus) => JOB_STATUS_LABEL[value]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {JOB_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {JOB_STATUS_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={completing} onOpenChange={(next) => !isPending && setCompleting(next)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Complete this job</DialogTitle>
            <DialogDescription>{label}</DialogDescription>
          </DialogHeader>
          <form id={`complete-${jobId}`} onSubmit={handleComplete} noValidate className="space-y-2">
            <Label htmlFor={`invoice-${jobId}`}>Invoice total (USD)</Label>
            <Input
              id={`invoice-${jobId}`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 540.00"
              inputMode="decimal"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Optional. Automation rules such as “notify me when a completed job clears $500” evaluate this amount.
            </p>
            <FormError>{error}</FormError>
          </form>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={isPending} />}>Cancel</DialogClose>
            <Button type="submit" form={`complete-${jobId}`} disabled={isPending}>
              {isPending ? "Saving…" : "Mark completed"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
