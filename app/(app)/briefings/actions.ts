"use server";

import { revalidatePath } from "next/cache";
import { getScopedDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { generateDailyBriefing, AIError } from "@/lib/ai";
import { fail, OK, toActionError, type ActionResult } from "@/lib/action-result";
import { assertBriefingAllowed } from "@/lib/throttle";

export async function createDailyBriefing(): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (!session) return fail("Your session expired. Sign in again.");
    // A briefing summarizes the whole organization's activity and revenue, so it's a
    // management view — technicians (who see only their own jobs) don't get it.
    assertCan(session, "generate:briefing");
    const db = await getScopedDb();
    await assertBriefingAllowed(db);

    await generateDailyBriefing(db);
    revalidatePath("/briefings");
    revalidatePath("/dashboard");
    return OK;
  } catch (err) {
    if (err instanceof AIError) {
      return fail(err.message);
    }
    try {
      return toActionError(err);
    } catch (unexpected) {
      console.error("createDailyBriefing: unexpected error", unexpected);
      return fail("Unexpected error generating the briefing.");
    }
  }
}
