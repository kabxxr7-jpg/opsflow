"use server";

import { revalidatePath } from "next/cache";
import { getScopedDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCanUpdateJob } from "@/lib/authz";
import { runAutomations } from "@/lib/automations";
import type { JobStatus } from "@prisma/client";

export async function updateJobStatus(jobId: string, status: JobStatus) {
  const session = await getSession();
  if (!session) throw new Error("No active session.");
  const db = await getScopedDb();

  const existing = await db.job.findUnique({ where: { id: jobId } });
  if (!existing) throw new Error("Job not found in this organization.");
  assertCanUpdateJob(session, existing);

  const job = await db.job.update({
    where: { id: jobId },
    data: {
      status,
      completedAt: status === "COMPLETED" ? new Date() : null,
    },
  });

  await runAutomations(db, { type: "job.status_changed", job });

  revalidatePath("/jobs");
  revalidatePath("/dashboard");
  revalidatePath("/automations");
}
