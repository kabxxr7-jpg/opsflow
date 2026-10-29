"use server";

import { revalidatePath } from "next/cache";
import { getScopedDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCanUpdateJob } from "@/lib/authz";
import { runAutomations } from "@/lib/automations";
import { fail, OK, toActionError, type ActionResult } from "@/lib/action-result";
import { jobStatusInputSchema, parseInput } from "@/lib/validation";
import type { JobStatus } from "@prisma/client";

/**
 * Changes a job's status. When a job is completed, the invoice total can be recorded in the same
 * step — that's what lets rules like "notify me when a completed job clears $500" actually
 * match. Without an amount the job still completes, but there's nothing for a revenue filter to
 * evaluate, so such a rule is (correctly) skipped.
 */
export async function updateJobStatus(jobId: string, status: JobStatus, revenue?: number): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (!session) return fail("Your session expired. Sign in again.");

    const input = parseInput(jobStatusInputSchema, { jobId, status, revenue });
    const db = await getScopedDb();

    const existing = await db.job.findUnique({ where: { id: input.jobId } });
    if (!existing) return fail("That job no longer exists.");
    assertCanUpdateJob(session, existing);

    const isCompleting = input.status === "COMPLETED";
    if (existing.status === input.status && !(isCompleting && input.revenue !== undefined)) {
      return OK; // nothing changed — don't re-fire automations or webhooks for a no-op
    }

    const job = await db.job.update({
      where: { id: input.jobId },
      data: {
        status: input.status,
        completedAt: isCompleting ? (existing.completedAt ?? new Date()) : null,
        ...(isCompleting && input.revenue !== undefined ? { revenue: input.revenue } : {}),
      },
    });

    await runAutomations(db, { type: "job.status_changed", job, fromStatus: existing.status });

    revalidatePath("/jobs");
    revalidatePath("/dashboard");
    revalidatePath("/automations");
    revalidatePath("/settings");
    return OK;
  } catch (err) {
    return toActionError(err);
  }
}
