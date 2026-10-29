import type { ScopedDb } from "@/lib/db";

/**
 * AutomationRun.rule and WebhookDelivery.webhookConfig are required relations with no cascade, so
 * Postgres refuses to delete a rule or endpoint that has ever been used — which, for anything
 * that's actually doing its job, is every one of them. Deleting "a rule" has to mean deleting its
 * history too; these helpers do that in a deliberate order rather than leaving the Delete button
 * to fail with a foreign-key error.
 *
 * Both take the org-scoped client, so neither the history nor the parent can belong to another
 * tenant: a foreign id matches nothing and the final delete reports "not found".
 *
 * Order matters. The parent is switched off first so nothing new starts accumulating history
 * while we clear it; a run that was already in flight can still land one last row, in which case
 * the final delete fails and the owner can simply press Delete again.
 */
export async function deleteRuleWithHistory(db: ScopedDb, ruleId: string): Promise<void> {
  await db.automationRule.update({ where: { id: ruleId }, data: { isActive: false } });
  await db.automationRun.deleteMany({ where: { ruleId } });
  await db.automationRule.delete({ where: { id: ruleId } });
}

export async function deleteWebhookWithHistory(db: ScopedDb, webhookConfigId: string): Promise<void> {
  await db.webhookConfig.update({ where: { id: webhookConfigId }, data: { isActive: false } });
  await db.webhookDelivery.deleteMany({ where: { webhookConfigId } });
  await db.webhookConfig.delete({ where: { id: webhookConfigId } });
}
