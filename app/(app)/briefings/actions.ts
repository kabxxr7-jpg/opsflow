"use server";

import { revalidatePath } from "next/cache";
import { getScopedDb } from "@/lib/db";
import { generateDailyBriefing, AIError } from "@/lib/ai";

export async function createDailyBriefing(): Promise<{ error: string | null }> {
  try {
    const db = await getScopedDb();
    await generateDailyBriefing(db);
    revalidatePath("/briefings");
    return { error: null };
  } catch (err) {
    if (err instanceof AIError) {
      return { error: err.message };
    }
    console.error("createDailyBriefing: unexpected error", err);
    return { error: "Unexpected error generating the briefing." };
  }
}
