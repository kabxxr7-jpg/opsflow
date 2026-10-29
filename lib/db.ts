import { Prisma, PrismaClient } from "@prisma/client";
import { getSession } from "@/lib/auth";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// The raw, unscoped client. Application code never imports this for tenant data — an ESLint rule
// (eslint.config.mjs) bans the import everywhere except the handful of files that legitimately
// have no tenant to scope by: this file, login (looks a user up *before* a session exists), the
// cron routes (enumerate organizations), the signature-verified integration endpoints, and seed.
export const rawDb = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = rawDb;

export class OrgScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrgScopeError";
  }
}

const lowerFirst = (s: string) => s[0].toLowerCase() + s.slice(1);

/**
 * The scoping rules are derived from the Prisma schema itself rather than from lists someone has
 * to remember to update: a model is a tenant model if it has an `organizationId`, a foreign key
 * is any scalar that backs a relation, and a "relation field" is anything a nested write could
 * `connect`/`create` through. Add a tenant table and it is scoped automatically; add a table
 * *without* an organizationId and the scoped client refuses to touch it until someone decides
 * what that means (see the default branch below) — it fails closed, never open.
 */
const META = (() => {
  const tenant = new Set<string>();
  const foreignKeys = new Map<string, { field: string; target: string }[]>();
  const relationFields = new Map<string, Set<string>>();
  for (const model of Prisma.dmmf.datamodel.models) {
    if (model.fields.some((f) => f.name === "organizationId")) tenant.add(model.name);
    relationFields.set(model.name, new Set(model.fields.filter((f) => f.kind === "object").map((f) => f.name)));
    const refs: { field: string; target: string }[] = [];
    for (const f of model.fields) {
      if (f.kind !== "object") continue;
      for (const scalar of f.relationFromFields ?? []) {
        if (scalar !== "organizationId") refs.push({ field: scalar, target: f.type });
      }
    }
    foreignKeys.set(model.name, refs);
  }
  return { tenant, foreignKeys, relationFields };
})();

// Identities and the tenants themselves. Reading another tenant's users (password hashes
// included) or organizations through a client that's supposed to be one tenant's view is exactly
// the leak this layer exists to prevent, so these are off-limits to it entirely. The few places
// that legitimately need them (login, cron, seed) use rawDb on purpose.
const BLOCKED_MODELS = new Set(["User", "Organization"]);

const toArray = <T>(v: T | T[]): T[] => (Array.isArray(v) ? v : [v]);

function withOrgScope(organizationId: string) {
  const refuse = (what: string) => () => {
    throw new OrgScopeError(`${what} isn't available on the org-scoped client; use the dedicated, reviewed code path instead.`);
  };

  /** Intersects the caller's filter with the tenant filter — never overrides one with the other. */
  function scopeWhere(where: unknown) {
    const w = (where && typeof where === "object" ? where : {}) as Record<string, unknown>;
    const and = w.AND === undefined ? [] : toArray(w.AND);
    return { ...w, AND: [...and, { organizationId }] };
  }

  /** A foreign key may only point at a row in the same organization. */
  async function assertInOrg(target: string, id: string, checked: Set<string>) {
    const key = `${target}:${id}`;
    if (checked.has(key)) return;
    const delegate = (rawDb as unknown as Record<string, { findFirst: (a: unknown) => Promise<unknown> }>)[lowerFirst(target)];
    if (!(await delegate.findFirst({ where: { id, organizationId }, select: { id: true } }))) {
      throw new OrgScopeError(`${target} not found in this organization.`);
    }
    checked.add(key);
  }

  async function guardWrite(model: string, data: unknown, mode: "create" | "update", checked: Set<string>) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new OrgScopeError(`Invalid write payload for ${model}.`);
    }
    const d = { ...(data as Record<string, unknown>) };

    for (const rel of META.relationFields.get(model) ?? []) {
      if (rel in d) {
        throw new OrgScopeError(`Nested relation writes ("${rel}") aren't allowed on the org-scoped client; pass scalar ids.`);
      }
    }

    if (mode === "create") {
      d.organizationId = organizationId; // always the caller's — whatever was passed is discarded
    } else if ("organizationId" in d) {
      throw new OrgScopeError("organizationId can't be changed.");
    }

    for (const { field, target } of META.foreignKeys.get(model) ?? []) {
      const raw = d[field];
      const value = raw && typeof raw === "object" && "set" in raw ? (raw as { set: unknown }).set : raw;
      if (value === undefined || value === null) continue;
      if (typeof value !== "string") throw new OrgScopeError(`Unsupported value for ${model}.${field}.`);
      await assertInOrg(target, value, checked);
    }
    return d;
  }

  return rawDb.$extends({
    name: "org-scope",
    client: {
      // Raw SQL would sail straight past the query extension below, so it's simply not offered.
      $queryRaw: refuse("Raw SQL"),
      $queryRawUnsafe: refuse("Raw SQL"),
      $executeRaw: refuse("Raw SQL"),
      $executeRawUnsafe: refuse("Raw SQL"),
    },
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (BLOCKED_MODELS.has(model)) refuse(`The ${model} model`)();
          if (!META.tenant.has(model)) refuse(`The ${model} model (it has no organizationId)`)();

          const a = args as Record<string, unknown>;
          const checked = new Set<string>();

          switch (operation) {
            case "findFirst":
            case "findFirstOrThrow":
            case "findMany":
            case "findUnique":
            case "findUniqueOrThrow":
            case "count":
            case "aggregate":
            case "groupBy":
            case "delete":
            case "deleteMany":
              a.where = scopeWhere(a.where);
              return query(a as never);

            case "create":
              a.data = await guardWrite(model, a.data, "create", checked);
              return query(a as never);

            case "createMany":
            case "createManyAndReturn":
              a.data = await Promise.all(toArray(a.data).map((row) => guardWrite(model, row, "create", checked)));
              return query(a as never);

            case "update":
            case "updateMany":
            case "updateManyAndReturn":
              a.where = scopeWhere(a.where);
              a.data = await guardWrite(model, a.data, "update", checked);
              return query(a as never);

            case "upsert":
              a.where = scopeWhere(a.where);
              a.create = await guardWrite(model, a.create, "create", checked);
              a.update = await guardWrite(model, a.update, "update", checked);
              return query(a as never);

            default:
              // Fail closed: an operation this layer hasn't been taught to scope is refused, not passed through.
              throw new OrgScopeError(`Operation "${operation}" isn't supported on the org-scoped client.`);
          }
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
