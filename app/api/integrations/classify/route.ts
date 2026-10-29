import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { verifySignature } from "@/lib/webhooks";
import { classifyTicket, AIError } from "@/lib/ai";
import { LIMITS } from "@/lib/rule-fields";

// Same ceiling the in-app "new ticket" form enforces, so this endpoint can't be used to push
// arbitrarily large text at the (metered) model.
const MAX_BODY_BYTES = 64 * 1024;

const bodySchema = z.object({
  rawText: z.string().trim().min(1).max(LIMITS.ticketText),
});

/**
 * Signed endpoint the n8n workflow (integrations/n8n/) calls mid-flow to classify an incoming
 * message before deciding whether to route it on. Same classification logic as the in-app
 * "Classify" button on /tickets, exposed as a signed HTTP endpoint for external callers.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }
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

  // A correctly signed body can still be something other than JSON; that's a 400, not a crash.
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Body is not valid JSON." }, { status: 400 });
  }

  const parsedBody = bodySchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const result = await classifyTicket(parsedBody.data.rawText);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AIError) {
      return NextResponse.json({ error: err.message, kind: err.kind }, { status: 502 });
    }
    console.error("POST /api/integrations/classify: unexpected error", err);
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
