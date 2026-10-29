"use server";

import { revalidatePath } from "next/cache";
import { getScopedDb, type ScopedDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { runAutomations } from "@/lib/automations";
import { classifyTicket, AIError } from "@/lib/ai";
import { fail, OK, toActionError, type ActionResult } from "@/lib/action-result";
import { parseInput, ticketInputSchema } from "@/lib/validation";
import { assertTicketCreationAllowed } from "@/lib/throttle";

function revalidateTickets() {
  revalidatePath("/tickets");
  revalidatePath("/dashboard");
  revalidatePath("/automations");
}

async function classifyAndSave(db: ScopedDb, ticketId: string): Promise<ActionResult> {
  const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    return fail("Ticket not found.");
  }
  // One classification per ticket: the button is only offered for unclassified tickets, and
  // refusing a repeat here means a direct call can't be used to re-run the model endlessly.
  if (ticket.classification !== null) {
    return fail("This ticket has already been classified.");
  }

  try {
    const result = await classifyTicket(ticket.rawText);
    const updated = await db.ticket.update({
      where: { id: ticketId },
      data: {
        classification: result.classification,
        priority: result.priority,
        summary: result.summary,
        confidence: result.confidence,
        sourceSnippet: result.sourceSnippet,
      },
    });

    // Re-evaluate ticket.created automations now that the ticket has real priority data —
    // the "flag urgent tickets" rule can only match once classification has actually run.
    await runAutomations(db, { type: "ticket.created", ticket: updated });

    revalidateTickets();
    return OK;
  } catch (err) {
    if (err instanceof AIError) {
      return fail(err.message);
    }
    console.error("classifyTicketById: unexpected error", err);
    return fail("Unexpected error classifying this ticket.");
  }
}

export async function createTicket(formData: FormData): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (!session) return fail("Your session expired. Sign in again.");
    assertCan(session, "write:tickets");
    const db = await getScopedDb();

    const input = parseInput(ticketInputSchema, {
      rawText: String(formData.get("rawText") ?? ""),
      source: String(formData.get("source") ?? "chat"),
      jobId: String(formData.get("jobId") ?? "") || undefined,
    });
    await assertTicketCreationAllowed(db);

    if (input.jobId) {
      const job = await db.job.findUnique({ where: { id: input.jobId } });
      // One answer for "doesn't exist" and "isn't yours", so the form can't be used to confirm a
      // coworker's job id; a technician may only attach tickets to jobs assigned to them.
      if (!job || (session.role === "TECHNICIAN" && job.assignedToId !== session.userId)) {
        return fail("That job wasn't found.");
      }
    }

    const ticket = await db.ticket.create({
      data: {
        rawText: input.rawText,
        source: input.source,
        jobId: input.jobId ?? null,
        organizationId: "", // overwritten unconditionally by the org-scope extension (lib/db.ts)
      },
    });

    await runAutomations(db, { type: "ticket.created", ticket });
    revalidateTickets();

    // Classification happens after the ticket already exists and the creation-time automation
    // run is logged, so a slow or failed Gemini call never blocks ticket creation itself.
    await classifyAndSave(db, ticket.id);

    return OK;
  } catch (err) {
    return toActionError(err);
  }
}

export async function classifyTicketById(ticketId: string): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (!session) return fail("Your session expired. Sign in again.");
    assertCan(session, "write:tickets");
    const db = await getScopedDb();
    return await classifyAndSave(db, String(ticketId).slice(0, 64));
  } catch (err) {
    return toActionError(err);
  }
}
