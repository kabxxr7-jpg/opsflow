"use server";

import { revalidatePath } from "next/cache";
import { getScopedDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { fail, OK, toActionError, UserInputError, type ActionResult } from "@/lib/action-result";
import { parseInput, webhookInputSchema } from "@/lib/validation";
import { assertSafeWebhookTarget } from "@/lib/safe-url";
import { deleteWebhookWithHistory } from "@/lib/cleanup";
import { LIMITS } from "@/lib/rule-fields";
import type { JobStatus } from "@prisma/client";

// `secret` is write-only: it's accepted here but never sent back to the browser. Leaving it
// blank when editing keeps the one already stored.
export type WebhookConfigInput = {
  targetUrl: string;
  secret?: string;
  isActive: boolean;
  triggerOn: JobStatus[];
};

function revalidateSettings() {
  revalidatePath("/settings");
}

async function requireOwner() {
  const session = await getSession();
  if (!session) throw new UserInputError("Your session expired. Sign in again.");
  assertCan(session, "manage:webhooks");
  return getScopedDb();
}

function checkSecret(secret: string | undefined): ActionResult | null {
  if (secret !== undefined && secret.length < LIMITS.secretMin) {
    return fail(`Use a signing secret of at least ${LIMITS.secretMin} characters.`);
  }
  return null;
}

export async function createWebhookConfig(input: WebhookConfigInput): Promise<ActionResult> {
  try {
    const db = await requireOwner();
    const hook = parseInput(webhookInputSchema, input);
    if (!hook.secret) return fail("A signing secret is required.");
    const secretProblem = checkSecret(hook.secret);
    if (secretProblem) return secretProblem;
    // Throws UnsafeUrlError (surfaced to the user as-is) for private/internal/non-https targets.
    const url = await assertSafeWebhookTarget(hook.targetUrl);
    if ((await db.webhookConfig.count()) >= LIMITS.maxWebhooksPerOrg) {
      return fail(`This organization is at its limit of ${LIMITS.maxWebhooksPerOrg} webhook endpoints. Delete one first.`);
    }
    await db.webhookConfig.create({
      data: {
        targetUrl: url.toString(),
        secret: hook.secret,
        isActive: hook.isActive,
        triggerOn: hook.triggerOn,
        organizationId: "", // overwritten unconditionally by the org-scope extension (lib/db.ts)
      },
    });
    revalidateSettings();
    return OK;
  } catch (err) {
    return toActionError(err);
  }
}

export async function updateWebhookConfig(id: string, input: WebhookConfigInput): Promise<ActionResult> {
  try {
    const db = await requireOwner();
    const hook = parseInput(webhookInputSchema, input);
    const secretProblem = checkSecret(hook.secret);
    if (secretProblem) return secretProblem;
    const url = await assertSafeWebhookTarget(hook.targetUrl);
    await db.webhookConfig.update({
      where: { id },
      data: {
        targetUrl: url.toString(),
        isActive: hook.isActive,
        triggerOn: hook.triggerOn,
        ...(hook.secret ? { secret: hook.secret } : {}),
      },
    });
    revalidateSettings();
    return OK;
  } catch (err) {
    return toActionError(err);
  }
}

export async function deleteWebhookConfig(id: string): Promise<ActionResult> {
  try {
    const db = await requireOwner();
    await deleteWebhookWithHistory(db, id);
    revalidateSettings();
    return OK;
  } catch (err) {
    return toActionError(err);
  }
}

export async function toggleWebhookConfig(id: string, isActive: boolean): Promise<ActionResult> {
  try {
    const db = await requireOwner();
    await db.webhookConfig.update({ where: { id }, data: { isActive: Boolean(isActive) } });
    revalidateSettings();
    return OK;
  } catch (err) {
    return toActionError(err);
  }
}
