import type { UserRole } from "@prisma/client";
import { rawDb } from "../lib/db";

/** Integration tests create and delete real rows; never let them near a shared database. */
export function assertLocalDb() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/(localhost|127\.0\.0\.1)/.test(url) && process.env.ALLOW_REMOTE_TEST_DB !== "1") {
    throw new Error("Refusing to run integration tests against a non-local database. Set ALLOW_REMOTE_TEST_DB=1 to override.");
  }
}

/** A throwaway organization with one user, customer and job. Removed (by cascade) via dropOrgs. */
export async function makeOrg(label: string, role: UserRole = "OWNER") {
  const slug = `test-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await rawDb.organization.create({ data: { name: `Test ${label}`, slug } });
  const user = await rawDb.user.create({
    data: { organizationId: org.id, email: `${slug}@test.invalid`, passwordHash: "x:y", name: `User ${label}`, role },
  });
  const customer = await rawDb.customer.create({ data: { organizationId: org.id, name: `Customer ${label}` } });
  const job = await rawDb.job.create({
    data: {
      organizationId: org.id,
      customerId: customer.id,
      assignedToId: user.id,
      jobType: `Job ${label}`,
      status: "SCHEDULED",
    },
  });
  return { org, user, customer, job };
}

export async function dropOrgs(...ids: (string | undefined)[]) {
  const real = ids.filter(Boolean) as string[];
  if (real.length) await rawDb.organization.deleteMany({ where: { id: { in: real } } });
}
