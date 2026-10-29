import { NextRequest, NextResponse } from "next/server";
import { retryFailedDeliveries } from "@/lib/webhooks";
import { rawDb, getOrgDb } from "@/lib/db";
import { isAuthorizedCron } from "@/lib/cron-auth";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // No session here (Vercel Cron, not a browser) — iterate every organization and run the
  // sweep once per tenant, each through its own org-scoped client. Never a single unscoped
  // sweep across all tenants' deliveries at once.
  const orgs = await rawDb.organization.findMany({ select: { id: true, slug: true } });

  // allSettled, not all: one organization's failure must not discard the others' results (or
  // make the whole run look like it failed).
  const settled = await Promise.allSettled(
    orgs.map(async (org) => ({ org: org.slug, ...(await retryFailedDeliveries(getOrgDb(org.id))) }))
  );

  const results = settled.map((outcome, i) => {
    if (outcome.status === "fulfilled") return outcome.value;
    console.error(`cron/retry-webhooks: org ${orgs[i].slug} failed`, outcome.reason);
    return { org: orgs[i].slug, error: "failed" };
  });

  return NextResponse.json({ results });
}
