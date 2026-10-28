"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
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

export async function createWebhookConfig(input: WebhookConfigInput) {
  await db.webhookConfig.create({ data: input });
  revalidateSettings();
}

export async function updateWebhookConfig(id: string, input: WebhookConfigInput) {
  await db.webhookConfig.update({ where: { id }, data: input });
  revalidateSettings();
}

export async function deleteWebhookConfig(id: string) {
  await db.webhookConfig.delete({ where: { id } });
  revalidateSettings();
}

export async function toggleWebhookConfig(id: string, isActive: boolean) {
  await db.webhookConfig.update({ where: { id }, data: { isActive } });
  revalidateSettings();
}
