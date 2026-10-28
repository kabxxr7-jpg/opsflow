"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { runAutomations } from "@/lib/automations";
import type { JobStatus } from "@prisma/client";

export async function updateJobStatus(jobId: string, status: JobStatus) {
  const job = await db.job.update({
    where: { id: jobId },
    data: {
      status,
      completedAt: status === "COMPLETED" ? new Date() : null,
    },
  });

  await runAutomations({ type: "job.status_changed", job });

  revalidatePath("/jobs");
  revalidatePath("/dashboard");
  revalidatePath("/automations");
}
