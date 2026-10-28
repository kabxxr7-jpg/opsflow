import { NextRequest, NextResponse } from "next/server";
import { retryFailedDeliveries } from "@/lib/webhooks";

export async function GET(request: NextRequest) {
  // See app/api/cron/simulate-day/route.ts for why this read must be unconditional — it's what
  // stops Next's Cache Components build-time prerender probe from running this for real.
  const auth = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await retryFailedDeliveries();
  return NextResponse.json(result);
}
