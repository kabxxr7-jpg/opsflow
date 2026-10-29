"use server";

import { revalidatePath } from "next/cache";
import { getScopedDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";

export type RuleTriggerInput = {
  type: "job.status_changed" | "ticket.created";
  status?: string;
};

export type RuleFilterInput = {
  field: string;
  op: "eq" | "gt" | "lt" | "gte" | "lte";
  value: string;
};

export type RuleActionInput = {
  type: "tag" | "webhook";
  value?: string;
};

export type RuleInput = {
  name: string;
  isActive: boolean;
  trigger: RuleTriggerInput;
  filters: RuleFilterInput[];
  actions: RuleActionInput[];
};

function revalidateAutomations() {
  revalidatePath("/automations");
  revalidatePath("/dashboard");
}

async function requireOwner() {
  const session = await getSession();
  if (!session) throw new Error("No active session.");
  assertCan(session, "manage:automations");
  return getScopedDb();
}

export async function createRule(input: RuleInput) {
  const db = await requireOwner();
  await db.automationRule.create({
    data: {
      name: input.name,
      isActive: input.isActive,
      trigger: input.trigger,
      filters: input.filters,
      actions: input.actions,
      organizationId: "", // overwritten unconditionally by the org-scope extension (lib/db.ts)
    },
  });
  revalidateAutomations();
}

export async function updateRule(id: string, input: RuleInput) {
  const db = await requireOwner();
  await db.automationRule.update({
    where: { id },
    data: {
      name: input.name,
      isActive: input.isActive,
      trigger: input.trigger,
      filters: input.filters,
      actions: input.actions,
    },
  });
  revalidateAutomations();
}

export async function deleteRule(id: string) {
  const db = await requireOwner();
  await db.automationRule.delete({ where: { id } });
  revalidateAutomations();
}

export async function toggleRule(id: string, isActive: boolean) {
  const db = await requireOwner();
  await db.automationRule.update({ where: { id }, data: { isActive } });
  revalidateAutomations();
}
