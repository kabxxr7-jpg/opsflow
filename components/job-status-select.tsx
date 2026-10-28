"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import type { JobStatus } from "@prisma/client";
import { updateJobStatus } from "@/app/(app)/jobs/actions";
import { JOB_STATUS_LABEL } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUSES: JobStatus[] = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

export function JobStatusSelect({ jobId, status }: { jobId: string; status: JobStatus }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Select
      value={status}
      disabled={isPending}
      onValueChange={(value) => {
        if (!value) return;
        startTransition(async () => {
          await updateJobStatus(jobId, value as JobStatus);
          toast.success(`Job status updated to ${JOB_STATUS_LABEL[value as JobStatus]}.`);
        });
      }}
    >
      <SelectTrigger size="sm" className="w-[140px]">
        <SelectValue>{(value: JobStatus) => JOB_STATUS_LABEL[value]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {JOB_STATUS_LABEL[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
