import { GoogleGenAI, ApiError } from "@google/genai";
import { z } from "zod";
import { env } from "@/lib/env";
import type { ScopedDb } from "@/lib/db";
import { briefingWindow } from "@/lib/briefing-stats";

const globalForGemini = globalThis as unknown as { gemini: GoogleGenAI | undefined };

// Constructed lazily (not at module scope) so the app can build and run without
// GEMINI_API_KEY set — it's only required when ticket classification or briefings are used.
// The one vendor-specific piece of this file is isolated here: swapping Gemini for Claude's
// or OpenAI's structured-output mode means changing this function and MODEL only, the
// classifyTicket/generateDailyBriefing signatures and the validation discipline don't change.
function getClient(): GoogleGenAI {
  if (!globalForGemini.gemini) {
    globalForGemini.gemini = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }
  return globalForGemini.gemini;
}

// flash-lite over flash: these are single structured-extraction calls, not tasks that need the
// heaviest model, and the lite tier has proven more available under free-tier load in testing.
const MODEL = "gemini-flash-lite-latest";

export class AIError extends Error {
  constructor(
    message: string,
    public readonly kind: "not_configured" | "rate_limit" | "api_error" | "invalid_output" | "unknown"
  ) {
    super(message);
    this.name = "AIError";
  }
}

function wrapClientError(err: unknown, context: string): never {
  if (err instanceof ApiError) {
    if (err.status === 429) {
      throw new AIError("Gemini is rate-limited right now. Try again shortly.", "rate_limit");
    }
    if (err.status === 503) {
      throw new AIError("Gemini is temporarily overloaded. Try again in a moment.", "api_error");
    }
    throw new AIError(`Gemini API error (${err.status}). Try again shortly.`, "api_error");
  }
  console.error(`${context}: unexpected error`, err);
  throw new AIError(`Unexpected error during ${context}.`, "unknown");
}

// ---------------------------------------------------------------------------
// Ticket classification
// ---------------------------------------------------------------------------

export const TICKET_CATEGORIES = [
  "billing",
  "scheduling",
  "complaint",
  "compliment",
  "equipment_issue",
  "upsell_opportunity",
  "general_inquiry",
  "other",
] as const;

const ticketClassificationSchema = z.object({
  classification: z.enum(TICKET_CATEGORIES),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  summary: z.string(),
  confidence: z.number().min(0).max(1),
  sourceSnippet: z
    .string()
    .describe("A short exact quote copied from the ticket text that grounds this classification."),
});

export type TicketClassification = z.infer<typeof ticketClassificationSchema>;

const ticketClassificationJsonSchema = z.toJSONSchema(ticketClassificationSchema);

function buildClassificationPrompt(rawText: string): string {
  return [
    "You are triaging an incoming customer message for a home-service business (HVAC, plumbing, electrical).",
    "Read the message and classify it. Be conservative with confidence — if the message is ambiguous, say so with a lower score rather than guessing.",
    "",
    `Categories: ${TICKET_CATEGORIES.join(", ")}`,
    "Priority reflects urgency to the business, not just emotional tone: a billing question is rarely URGENT even if the customer sounds annoyed, but a safety issue (gas smell, sparking outlet) is.",
    "sourceSnippet must be an exact substring copied from the message below, the specific phrase that justifies your classification, not a paraphrase.",
    "",
    "Message:",
    rawText,
  ].join("\n");
}

/**
 * Classifies a single ticket's raw text. Fills Ticket.classification/priority/summary/
 * confidence/sourceSnippet. Never trusts the model's output without validating it against
 * ticketClassificationSchema first, even though the schema was already sent to the model.
 */
export async function classifyTicket(rawText: string): Promise<TicketClassification> {
  let client: GoogleGenAI;
  try {
    client = getClient();
  } catch {
    throw new AIError("GEMINI_API_KEY is not set. Add it to .env to enable AI classification.", "not_configured");
  }

  let rawOutput: string | undefined;
  try {
    const response = await client.models.generateContent({
      model: MODEL,
      contents: buildClassificationPrompt(rawText),
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: ticketClassificationJsonSchema,
      },
    });
    rawOutput = response.text;
  } catch (err) {
    wrapClientError(err, "ticket classification");
  }

  if (!rawOutput) {
    throw new AIError("Gemini did not return any output for this ticket.", "invalid_output");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawOutput);
  } catch {
    console.error("Ticket classification: failed to parse Gemini output as JSON:", rawOutput);
    throw new AIError("Gemini's response wasn't valid JSON. This has been logged.", "invalid_output");
  }

  const result = ticketClassificationSchema.safeParse(parsed);
  if (!result.success) {
    console.error("Ticket classification: structured output failed schema validation:", result.error.message);
    throw new AIError("Gemini's response didn't match the expected format. This has been logged.", "invalid_output");
  }

  // Extra defense beyond schema validation: confirm the "exact quote" claim is actually true
  // rather than trusting the model's self-report. A hallucinated snippet that doesn't appear
  // in the source text is exactly the kind of fabrication these guardrails exist to catch.
  if (!rawText.includes(result.data.sourceSnippet)) {
    console.warn(
      `Ticket classification: sourceSnippet not found verbatim in source text, lowering confidence. Claimed: "${result.data.sourceSnippet}"`
    );
    return { ...result.data, confidence: Math.min(result.data.confidence, 0.4) };
  }

  return result.data;
}

// ---------------------------------------------------------------------------
// Daily briefing
// ---------------------------------------------------------------------------

const briefingHighlightSchema = z.object({
  type: z.enum(["opportunity", "risk", "follow_up", "praise"]),
  description: z.string(),
  sourceTicketId: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

const dailyBriefingSchema = z.object({
  summary: z.string().describe("A 2-4 sentence narrative overview of the day's ticket activity."),
  highlights: z.array(briefingHighlightSchema),
});

export type DailyBriefingResult = z.infer<typeof dailyBriefingSchema>;

const dailyBriefingJsonSchema = z.toJSONSchema(dailyBriefingSchema);

function buildBriefingPrompt(
  tickets: { id: string; rawText: string; classification: string | null; priority: string | null }[],
  correction?: string
): string {
  const ticketLines = tickets
    .map((t) => `- [id: ${t.id}] (${t.classification ?? "unclassified"}, ${t.priority ?? "no priority"}) ${t.rawText}`)
    .join("\n");

  return [
    "You are writing a short management briefing for the owner of a home-service business, based on the customer tickets that came in over the last 24 hours.",
    "Write a concise narrative summary of what came in and what needs attention, then extract specific highlights: opportunities (e.g. upsell potential, a recurring complaint pattern), risks (e.g. a customer likely to churn), follow-ups needed, or praise worth passing to a technician.",
    "The app already shows exact job counts and revenue next to your summary, computed from the database. So the narrative must NOT state any dollar amounts or numbers of jobs — describe themes, urgency, and what to do about them in words.",
    "Every highlight's sourceTicketId must be one of the exact ticket ids listed below, or null if the highlight is about overall activity rather than a specific ticket. Do not invent ticket ids.",
    "Be honest about confidence — if you're inferring something not clearly stated, use a lower score.",
    ...(correction ? ["", `Correction: ${correction}`] : []),
    "",
    "Tickets:",
    ticketLines || "(no tickets in this period)",
  ].join("\n");
}

// The narrative is not allowed to carry figures (see the prompt): the only job counts and revenue
// on screen are the ones computed from the database. This is the check behind that instruction —
// a model told "don't state numbers" will still occasionally do it, and "18 jobs completed" next
// to a header saying 2 is precisely the failure mode a hallucination-safeguards project can't ship.
const FIGURE_IN_NARRATIVE = /\$\s?\d|\b\d[\d,]*(?:\.\d+)?\s+(?:total\s+|new\s+|open\s+)?(?:jobs?|work orders?)\b/i;

export function findInventedFigure(summary: string): string | null {
  const m = summary.match(FIGURE_IN_NARRATIVE);
  return m ? m[0] : null;
}

/** Drops any sentence containing a figure; used only if the model repeats the mistake after a retry. */
export function stripFigureSentences(summary: string): string {
  const kept = summary.split(/(?<=[.!?])\s+/).filter((sentence) => !FIGURE_IN_NARRATIVE.test(sentence));
  return kept.join(" ").trim();
}

async function requestBriefing(client: GoogleGenAI, prompt: string): Promise<DailyBriefingResult> {
  let rawOutput: string | undefined;
  try {
    const response = await client.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: dailyBriefingJsonSchema,
      },
    });
    rawOutput = response.text;
  } catch (err) {
    wrapClientError(err, "daily briefing generation");
  }

  if (!rawOutput) {
    throw new AIError("Gemini did not return any output for the briefing.", "invalid_output");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawOutput);
  } catch {
    console.error("Daily briefing: failed to parse Gemini output as JSON:", rawOutput);
    throw new AIError("Gemini's response wasn't valid JSON. This has been logged.", "invalid_output");
  }

  const result = dailyBriefingSchema.safeParse(parsed);
  if (!result.success) {
    console.error("Daily briefing: structured output failed schema validation:", result.error.message);
    throw new AIError("Gemini's response didn't match the expected format. This has been logged.", "invalid_output");
  }
  return result.data;
}

/**
 * Reads the last 24 hours of tickets, asks Gemini for a narrative summary plus cited highlights,
 * validates the result, and persists it as a DailyBriefing row. Job counts and revenue are *not*
 * the model's to report — the briefings page renders them straight from the database using the
 * same window (lib/briefing-stats.ts), so the narrative and the numbers can't disagree.
 */
export async function generateDailyBriefing(db: ScopedDb): Promise<DailyBriefingResult> {
  const at = new Date();
  const { start } = briefingWindow(at);

  const tickets = await db.ticket.findMany({
    where: { createdAt: { gte: start, lte: at } },
    select: { id: true, rawText: true, classification: true, priority: true },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  let client: GoogleGenAI;
  try {
    client = getClient();
  } catch {
    throw new AIError("GEMINI_API_KEY is not set. Add it to .env to enable the daily briefing.", "not_configured");
  }

  let result = await requestBriefing(client, buildBriefingPrompt(tickets));
  let invented = findInventedFigure(result.summary);
  if (invented) {
    console.warn(`Daily briefing: narrative stated a figure ("${invented}"); retrying once with a correction.`);
    result = await requestBriefing(
      client,
      buildBriefingPrompt(
        tickets,
        `your previous summary stated "${invented}". Rewrite it without any dollar amounts or job counts.`
      )
    );
    invented = findInventedFigure(result.summary);
    if (invented) {
      console.warn(`Daily briefing: figure persisted after retry ("${invented}"); stripping those sentences.`);
      result = { ...result, summary: stripFigureSentences(result.summary) || "See the highlights below for what came in." };
    }
  }

  // Same grounding check as classifyTicket: confirm every cited ticket id was actually in the
  // set we sent, rather than trusting the model not to invent one.
  const validTicketIds = new Set(tickets.map((t) => t.id));
  const groundedHighlights = result.highlights.map((h) =>
    h.sourceTicketId && !validTicketIds.has(h.sourceTicketId)
      ? { ...h, sourceTicketId: null, confidence: Math.min(h.confidence, 0.4) }
      : h
  );
  const grounded = { ...result, highlights: groundedHighlights };

  await db.dailyBriefing.create({
    data: {
      date: at,
      summary: grounded.summary,
      highlights: grounded.highlights,
      organizationId: "", // overwritten unconditionally by the org-scope extension (lib/db.ts)
    },
  });

  return grounded;
}
