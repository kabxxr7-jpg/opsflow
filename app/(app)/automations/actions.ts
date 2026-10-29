"use server";

import { revalidatePath } from "next/cache";
import { getScopedDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { fail, OK, toActionError, type ActionResult } from "@/lib/action-result";
import { parseInput, ruleInputSchema } from "@/lib/validation";
import { LIMITS } from "@/lib/rule-fields";
import { deleteRuleWithHistory } from "@/lib/cleanup";

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

export async function createRule(input: RuleInput): Promise<ActionResult> {
  try {
    const db = await requireOwner();
    const rule = parseInput(ruleInputSchema, input);
    if ((await db.automationRule.count()) >= LIMITS.maxRulesPerOrg) {
      return fail(`This organization is at its limit of ${LIMITS.maxRulesPerOrg} automation rules. Delete one first.`);
    }
    await db.automationRule.create({
      data: {
        name: rule.name,
        isActive: rule.isActive,
        trigger: rule.trigger,
        filters: rule.filters,
        actions: rule.actions,
        organizationId: "", // overwritten unconditionally by the org-scope extension (lib/db.ts)
      },
    });
    revalidateAutomations();
    return OK;
  } catch (err) {
    return toActionError(err);
  }
}

export async function updateRule(id: string, input: RuleInput): Promise<ActionResult> {
  try {
    const db = await requireOwner();
    const rule = parseInput(ruleInputSchema, input);
    await db.automationRule.update({
      where: { id },
      data: {
        name: rule.name,
        isActive: rule.isActive,
        trigger: rule.trigger,
        filters: rule.filters,
        actions: rule.actions,
      },
    });
    revalidateAutomations();
    return OK;
  } catch (err) {
    return toActionError(err);
  }
}

export async function deleteRule(id: string): Promise<ActionResult> {
  try {
    const db = await requireOwner();
    await deleteRuleWithHistory(db, id);
    revalidateAutomations();
    return OK;
  } catch (err) {
    return toActionError(err);
  }
}

export async function toggleRule(id: string, isActive: boolean): Promise<ActionResult> {
  try {
    const db = await requireOwner();
    await db.automationRule.update({ where: { id }, data: { isActive: Boolean(isActive) } });
    revalidateAutomations();
    return OK;
  } catch (err) {
    return toActionError(err);
  }
}
