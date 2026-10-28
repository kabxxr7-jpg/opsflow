"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { runAutomations } from "@/lib/automations";
import { classifyTicket, AIError } from "@/lib/ai";

function revalidateTickets() {
  revalidatePath("/tickets");
  revalidatePath("/dashboard");
  revalidatePath("/automations");
}

export async function createTicket(formData: FormData) {
  const rawText = String(formData.get("rawText") ?? "").trim();
  const source = String(formData.get("source") ?? "chat");
  const jobId = String(formData.get("jobId") ?? "");

  if (!rawText) {
    return { error: "Ticket text is required." };
  }

  const ticket = await db.ticket.create({
    data: {
      rawText,
      source,
      jobId: jobId || null,
    },
  });

  await runAutomations({ type: "ticket.created", ticket });
  revalidateTickets();

  // Classification happens after the ticket already exists and the creation-time automation
  // run is logged, so a slow or failed Gemini call never blocks ticket creation itself.
  await classifyTicketById(ticket.id);

  return { error: null };
}

export async function classifyTicketById(ticketId: string): Promise<{ error: string | null }> {
  const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    return { error: "Ticket not found." };
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
    await runAutomations({ type: "ticket.created", ticket: updated });

    revalidateTickets();
    return { error: null };
  } catch (err) {
    if (err instanceof AIError) {
      return { error: err.message };
    }
    console.error("classifyTicketById: unexpected error", err);
    return { error: "Unexpected error classifying this ticket." };
  }
}
