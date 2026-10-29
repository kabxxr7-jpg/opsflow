"use server";

import { revalidatePath } from "next/cache";
import { getScopedDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { extractTextFromImage, OCRError } from "@/lib/ocr";
import { classifyTicket, AIError } from "@/lib/ai";
import { runAutomations } from "@/lib/automations";
import { assertTicketCreationAllowed } from "@/lib/throttle";
import { toActionError } from "@/lib/action-result";
import { MAX_UPLOAD_BYTES, sniffImageType } from "@/lib/image";
import { LIMITS } from "@/lib/rule-fields";

// A "use server" file may only export async functions — exporting a constant here makes Next
// throw when the module loads, which takes the whole action down. Shared constants live in lib/.

type IntakeResult = { error: string | null; ticketId: string | null };
const failure = (error: string): IntakeResult => ({ error, ticketId: null });

export async function processImageIntake(formData: FormData): Promise<IntakeResult> {
  try {
    const session = await getSession();
    if (!session) return failure("Your session expired. Sign in again.");
    assertCan(session, "use:intake");
    const db = await getScopedDb();

    // Checked first, before any of the expensive work: OCR burns real CPU and classification
    // spends metered API quota, and this action is reachable by anyone holding the public demo login.
    await assertTicketCreationAllowed(db);

    const file = formData.get("image");
    if (!(file instanceof File) || file.size === 0) {
      return failure("Choose an image to upload.");
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return failure("That image is too large (4 MB max). Try a smaller photo or a screenshot.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!sniffImageType(buffer)) {
      return failure("That file doesn't look like a JPEG, PNG, or WebP image.");
    }

    let ocrText: string;
    let ocrConfidence: number;
    try {
      const ocrResult = await extractTextFromImage(buffer);
      ocrText = ocrResult.text.slice(0, LIMITS.ticketText);
      ocrConfidence = ocrResult.confidence;
    } catch (err) {
      if (err instanceof OCRError) {
        return failure(err.message);
      }
      console.error("processImageIntake: OCR failed", err);
      return failure("Couldn't read text from that image. Try a clearer photo.");
    }

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
  } catch (err) {
    try {
      return failure(toActionError(err).error ?? "Something went wrong.");
    } catch (unexpected) {
      console.error("processImageIntake: unexpected error", unexpected);
      return failure("Something went wrong processing that image.");
    }
  }
}
