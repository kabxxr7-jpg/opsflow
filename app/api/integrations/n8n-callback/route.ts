import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { verifySignature } from "@/lib/webhooks";
import { rawDb, getOrgDb } from "@/lib/db";
import { runAutomations } from "@/lib/automations";

const bodySchema = z.object({
  rawText: z.string().min(1),
  source: z.string().default("n8n"),
  classification: z.enum([
    "billing",
    "scheduling",
    "complaint",
    "compliment",
    "equipment_issue",
    "upsell_opportunity",
    "general_inquiry",
    "other",
  ]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  summary: z.string(),
  confidence: z.number().min(0).max(1),
  sourceSnippet: z.string(),
});

/**
 * Receives the already-classified result from the n8n workflow (integrations/n8n/
 * ticket-intake-workflow.json) and creates the Ticket with its AI fields pre-filled, rather
 * than re-classifying — the workflow already called /api/integrations/classify upstream.
 * Signature is verified the same way an outbound receiver would verify one of ours, so
 * signing and verifying share one implementation (lib/webhooks.ts verifySignature).
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const timestamp = request.headers.get("X-Webhook-Timestamp");
  const signature = request.headers.get("X-Webhook-Signature");

  if (
    !timestamp ||
    !verifySignature({
      secret: env.N8N_CALLBACK_SECRET,
      timestamp,
      body: rawBody,
      signatureHeader: signature,
    })
  ) {
    return NextResponse.json({ error: "Invalid or missing signature." }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Body is not valid JSON." }, { status: 400 });
  }

  const parsedBody = bodySchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request body.", details: parsedBody.error.issues }, { status: 400 });
  }

  const data = parsedBody.data;

  // No browser session here — N8N_CALLBACK_SECRET is currently one global secret (not yet
  // per-organization), which in practice means one organization. Resolved via lookup, not
  // trusted from the request body, same "never take organizationId from the client" rule the
  // scoping layer itself follows.
  const org = await rawDb.organization.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } });
  if (!org) {
    return NextResponse.json({ error: "No organization configured." }, { status: 500 });
  }
  const db = getOrgDb(org.id);

  // Same grounding check as the in-app classify path: don't persist a snippet the model
  // (or in this case, the upstream n8n call) claims came from the text if it actually didn't.
  const sourceSnippet = data.rawText.includes(data.sourceSnippet) ? data.sourceSnippet : null;

  const ticket = await db.ticket.create({
    data: {
      rawText: data.rawText,
      source: data.source,
      organizationId: "", // overwritten unconditionally by the org-scope extension (lib/db.ts)
      classification: data.classification,
      priority: data.priority,
      summary: data.summary,
      confidence: sourceSnippet ? data.confidence : Math.min(data.confidence, 0.4),
      sourceSnippet,
    },
  });

  await runAutomations(db, { type: "ticket.created", ticket });

  return NextResponse.json({ id: ticket.id }, { status: 201 });
}
