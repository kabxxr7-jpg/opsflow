import { NextRequest, NextResponse } from "next/server";

/**
 * Self-contained receiver for demoing/testing outbound webhook delivery without depending on
 * an external service. Logs the signature headers it received and echoes 200. Not meant as a
 * real integration target — WebhookConfig rows for actual third-party endpoints replace this.
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  console.log("[test-echo] received webhook:", {
    signature: request.headers.get("X-Webhook-Signature"),
    timestamp: request.headers.get("X-Webhook-Timestamp"),
    body,
  });
  return NextResponse.json({ received: true });
}
