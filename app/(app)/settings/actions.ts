"use server";

import { revalidatePath } from "next/cache";
import { getScopedDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import type { JobStatus } from "@prisma/client";

export type WebhookConfigInput = {
  targetUrl: string;
  secret: string;
  isActive: boolean;
  triggerOn: JobStatus[];
};

function revalidateSettings() {
  revalidatePath("/settings");
}

async function requireOwner() {
  const session = await getSession();
  if (!session) throw new Error("No active session.");
  assertCan(session, "manage:webhooks");
  return getScopedDb();
}

export async function createWebhookConfig(input: WebhookConfigInput) {
  const db = await requireOwner();
  await db.webhookConfig.create({ data: { ...input, organizationId: "" } }); // overwritten by org-scope extension
  revalidateSettings();
}

export async function updateWebhookConfig(id: string, input: WebhookConfigInput) {
  const db = await requireOwner();
  await db.webhookConfig.update({ where: { id }, data: input });
  revalidateSettings();
}

export async function deleteWebhookConfig(id: string) {
  const db = await requireOwner();
  await db.webhookConfig.delete({ where: { id } });
  revalidateSettings();
}

export async function toggleWebhookConfig(id: string, isActive: boolean) {
  const db = await requireOwner();
  await db.webhookConfig.update({ where: { id }, data: { isActive } });
  revalidateSettings();
}
