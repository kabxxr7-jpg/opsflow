"use server";

import { revalidatePath } from "next/cache";
import { getScopedDb } from "@/lib/db";
import { extractTextFromImage, OCRError } from "@/lib/ocr";
import { classifyTicket, AIError } from "@/lib/ai";
import { runAutomations } from "@/lib/automations";

const OCR_LOW_CONFIDENCE_THRESHOLD = 0.6;

export async function processImageIntake(
  formData: FormData
): Promise<{ error: string | null; ticketId: string | null }> {
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image to upload.", ticketId: null };
  }
  if (!file.type.startsWith("image/")) {
    return { error: "File must be an image.", ticketId: null };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let ocrText: string;
  let ocrConfidence: number;
  try {
    const ocrResult = await extractTextFromImage(buffer);
    ocrText = ocrResult.text;
    ocrConfidence = ocrResult.confidence;
  } catch (err) {
    if (err instanceof OCRError) {
      return { error: err.message, ticketId: null };
    }
    console.error("processImageIntake: OCR failed", err);
    return { error: "Unexpected error reading this image.", ticketId: null };
  }

  const db = await getScopedDb();

  // Create the ticket from the OCR text first, even if classification fails below, a low-
  // confidence or garbled OCR result should still be visible for human review, not dropped.
  let ticket = await db.ticket.create({
    data: {
      rawText: ocrText,
      source: "ocr_upload",
      ocrConfidence,
      organizationId: "", // overwritten unconditionally by the org-scope extension (lib/db.ts)
    },
  });

  try {
    const result = await classifyTicket(ocrText);
    ticket = await db.ticket.update({
      where: { id: ticket.id },
      data: {
        classification: result.classification,
        priority: result.priority,
        summary: result.summary,
        confidence: result.confidence,
        sourceSnippet: result.sourceSnippet,
      },
    });
  } catch (err) {
    // OCR text is still saved and visible even if classification itself fails, matching the
    // "flag for human review instead of failing silently" requirement this feature targets.
    if (!(err instanceof AIError)) {
      console.error("processImageIntake: classification failed", err);
    }
  }

  await runAutomations(db, { type: "ticket.created", ticket });

  revalidatePath("/intake");
  revalidatePath("/tickets");
  revalidatePath("/dashboard");
  revalidatePath("/automations");

  return { error: null, ticketId: ticket.id };
}

export { OCR_LOW_CONFIDENCE_THRESHOLD };
