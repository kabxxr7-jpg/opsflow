import { PrismaClient } from "@prisma/client";
import { getSession } from "@/lib/auth";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// The raw, unscoped client. Never imported directly by page/action/route code for tenant data —
// only this file (the scoping layer itself) and prisma/seed.ts (which has no session, by
// definition, and is responsible for creating organizations in the first place) touch it.
export const rawDb = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = rawDb;

// Every model that carries organizationId. Customer/Technician/Job/Ticket/AutomationRule/
// AutomationRun/WebhookConfig/WebhookDelivery/DailyBriefing — not User or Organization
// themselves, which are managed by the auth/admin layer, not generic tenant CRUD.
const TENANT_MODELS = new Set([
  "Customer",
  "Technician",
  "Job",
  "Ticket",
  "AutomationRule",
  "AutomationRun",
  "WebhookConfig",
  "WebhookDelivery",
  "DailyBriefing",
]);

const WHERE_INJECT_OPS = new Set(["findMany", "findFirst", "findFirstOrThrow", "count", "aggregate", "groupBy"]);
const DATA_INJECT_OPS = new Set(["create"]);

/**
 * Prisma client extension that automatically scopes every operation on a tenant model to one
 * organizationId. This is the thing a direct `rawDb.job.findMany()` call in application code
 * would bypass — which is exactly why application code never imports rawDb, only
 * getScopedDb()/getOrgDb() below.
 *
 * findUnique/update/delete take an id-shaped `where`, which can't just have organizationId
 * merged in (Prisma requires `where` on these to be a genuine unique-identifier shape — adding
 * an extra field makes it invalid, it doesn't make it "more specific"). So those three verify
 * ownership explicitly: findUnique fetches by id and discards the row if it belongs to a
 * different org (returns null, same shape a real "not found" would have); update/delete first
 * confirm the row belongs to this org via findFirst, and throw the same not-found-style error
 * Prisma itself would throw if nothing matched, rather than silently operating across tenants.
 */
function withOrgScope(organizationId: string) {
  return rawDb.$extends({
    name: "org-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_MODELS.has(model)) {
            return query(args);
          }

          const typedArgs = args as { where?: Record<string, unknown>; data?: unknown };

          if (WHERE_INJECT_OPS.has(operation)) {
            typedArgs.where = { ...(typedArgs.where ?? {}), organizationId };
            return query(typedArgs);
          }

          if (DATA_INJECT_OPS.has(operation)) {
            typedArgs.data = { ...(typedArgs.data as Record<string, unknown>), organizationId };
            return query(typedArgs);
          }

          if (operation === "createMany") {
            const dataArr = (typedArgs as unknown as { data: Record<string, unknown>[] }).data;
            (typedArgs as unknown as { data: Record<string, unknown>[] }).data = dataArr.map((d) => ({
              ...d,
              organizationId,
            }));
            return query(typedArgs);
          }

          if (operation === "findUnique" || operation === "findUniqueOrThrow") {
            const result = await query(args);
            if (result && (result as { organizationId?: string }).organizationId !== organizationId) {
              if (operation === "findUniqueOrThrow") {
                throw new Error(`${model} not found in this organization.`);
              }
              return null;
            }
            return result;
          }

          if (operation === "update" || operation === "delete") {
            // @ts-expect-error — every tenant model exposes findFirst with this shape at runtime
            const owned = await rawDb[model[0].toLowerCase() + model.slice(1)].findFirst({
              where: { ...(typedArgs.where ?? {}), organizationId },
              select: { id: true },
            });
            if (!owned) {
              throw new Error(`${model} not found in this organization.`);
            }
            return query(args);
          }

          if (operation === "updateMany" || operation === "deleteMany") {
            typedArgs.where = { ...(typedArgs.where ?? {}), organizationId };
            return query(typedArgs);
          }

          return query(args);
        },
      },
    },
  });
}

export type ScopedDb = ReturnType<typeof withOrgScope>;

/** For cron/seed/integration contexts that know the organizationId directly, no session. */
export function getOrgDb(organizationId: string): ScopedDb {
  return withOrgScope(organizationId);
}

/**
 * For Server Components/Actions/Route Handlers running in a real browser session. Reads the
 * session cookie itself so call sites don't have to separately fetch+thread organizationId —
 * `const db = await getScopedDb()` is the one line every page/action needs.
 */
export async function getScopedDb(): Promise<ScopedDb> {
  const session = await getSession();
  if (!session) throw new Error("getScopedDb() called with no active session.");
  return withOrgScope(session.organizationId);
}
