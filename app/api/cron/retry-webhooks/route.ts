import { NextRequest, NextResponse } from "next/server";
import { retryFailedDeliveries } from "@/lib/webhooks";
import { rawDb, getOrgDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  // Reading request.headers unconditionally (not inside `if (cronSecret)`) is load-bearing:
  // under Cache Components, `next build` prerender-probes GET route handlers by actually
  // invoking them, and only stops (deferring to request time) once it hits a request-time
  // signal like this.
  const auth = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // No session here (Vercel Cron, not a browser) — iterate every organization and run the
  // sweep once per tenant, each through its own org-scoped client. Never a single unscoped
  // sweep across all tenants' deliveries at once.
  const orgs = await rawDb.organization.findMany({ select: { id: true, slug: true } });
  const results = await Promise.all(
    orgs.map(async (org) => ({ org: org.slug, ...(await retryFailedDeliveries(getOrgDb(org.id))) }))
  );

  return NextResponse.json({ results });
}
