"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

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

export async function createRule(input: RuleInput) {
  await db.automationRule.create({
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

export async function updateRule(id: string, input: RuleInput) {
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
  await db.automationRule.delete({ where: { id } });
  revalidateAutomations();
}

export async function toggleRule(id: string, isActive: boolean) {
  await db.automationRule.update({ where: { id }, data: { isActive } });
  revalidateAutomations();
}
