import { NextRequest, NextResponse } from "next/server";
import { rawDb } from "@/lib/db";
import { verifySignature } from "@/lib/webhooks";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_SKEW_MS = 5 * 60_000; // same replay window verifySignature() enforces
const SIGNATURE_SHAPE = /^sha256=[0-9a-f]{64}$/;

/**
 * A real receiver for this app's own outbound webhooks, so the sign → deliver → verify loop can be
 * demonstrated end to end without depending on a third party staying up. It does what a
 * production receiver should: recompute the HMAC over the timestamp and raw body, compare in
 * constant time, enforce the replay window, and answer 401 to anything that doesn't verify.
 *
 * It's public (an outbound webhook can't carry a browser session), so it deliberately reveals
 * nothing about *why* a request failed and logs nothing for requests that don't verify.
 *
 * rawDb is intentional here: the request has no session, so there's no organization to scope by,
 * and the whole point is to find which endpoint's secret — if any — produced this signature.
 */
export async function POST(request: NextRequest) {
  const timestamp = request.headers.get("X-Webhook-Timestamp");
  const signature = request.headers.get("X-Webhook-Signature");

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  const unauthorized = () => NextResponse.json({ error: "Invalid or missing signature." }, { status: 401 });
  if (!timestamp || !signature) return unauthorized();
  // Cheap checks first. This endpoint is public, so anything that can be refused without a database
  // round-trip should be: a stale or malformed timestamp, or a header that isn't `sha256=<64 hex>`.
  const sentAt = Date.parse(timestamp);
  if (Number.isNaN(sentAt) || Date.now() - sentAt > MAX_SKEW_MS || !SIGNATURE_SHAPE.test(signature)) {
    return unauthorized();
  }

  const candidates = await rawDb.webhookConfig.findMany({
    where: { isActive: true, targetUrl: { endsWith: "/api/integrations/test-echo" } },
    select: { secret: true },
    take: 50,
  });
  const verified = candidates.some((c) =>
    verifySignature({ secret: c.secret, timestamp, body, signatureHeader: signature })
  );
  if (!verified) return unauthorized();

  let event = "unknown";
  try {
    event = String((JSON.parse(body) as { event?: unknown }).event ?? "unknown").slice(0, 64);
  } catch {
    /* a verified body that isn't JSON is still verified */
  }
  console.log(`[test-echo] verified webhook (${event})`);
  return NextResponse.json({ received: true, verified: true });
}
