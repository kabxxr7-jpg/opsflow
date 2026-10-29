import type { ScopedDb } from "@/lib/db";
import { UserInputError } from "@/lib/action-result";

// This demo publishes working credentials on its login page, so anyone on the internet can reach
// the actions that call a metered AI API (and the OCR engine, which burns real CPU). These caps
// keep a curious reviewer entirely unaffected while stopping a script from exhausting the free
// Gemini quota — and with it the AI features for the next person who opens the site.
//
// Deliberately database-backed rather than an in-memory counter: serverless instances don't share
// memory, so a per-process limiter would let a request that lands on a fresh instance through.

const TEN_MINUTES = 10 * 60_000;
const ONE_HOUR = 60 * 60_000;

export const LIMITS_PER_ORG = {
  ticketsPer10Min: 20,
  briefingsPerHour: 4,
} as const;

export async function assertTicketCreationAllowed(db: ScopedDb): Promise<void> {
  const recent = await db.ticket.count({ where: { createdAt: { gte: new Date(Date.now() - TEN_MINUTES) } } });
  if (recent >= LIMITS_PER_ORG.ticketsPer10Min) {
    throw new UserInputError("A lot of tickets were just created. Give it a few minutes before adding more.");
  }
}

export async function assertBriefingAllowed(db: ScopedDb): Promise<void> {
  const recent = await db.dailyBriefing.count({ where: { createdAt: { gte: new Date(Date.now() - ONE_HOUR) } } });
  if (recent >= LIMITS_PER_ORG.briefingsPerHour) {
    throw new UserInputError("Several briefings were just generated. Give it a few minutes before generating another.");
  }
}
