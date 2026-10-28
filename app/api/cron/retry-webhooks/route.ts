import { NextRequest, NextResponse } from "next/server";
import { retryFailedDeliveries } from "@/lib/webhooks";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await retryFailedDeliveries();
  return NextResponse.json(result);
}
