# Opsflow

**Live demo: [opsflow.vercel.app](https://opsflow.vercel.app)** — password shown right on the login screen, no need to ask.

A field-service ops automation and AI-reporting platform, built to demonstrate five specific
skills together in one cohesive app rather than five shallow demos: a trigger/filter/action
automation engine, AI classification with hallucination safeguards, signed two-way webhooks, a
real (not simulated) n8n workflow, and an OCR-to-LLM document intake pipeline.

All data is seeded/simulated, there's no real ServiceTitan, GoHighLevel, or other field-service
platform account behind this. The architecture, how data flows in, how rules fire, how AI output
gets validated before it's trusted, how webhooks get delivered reliably, is built the way a real
integration would be. That's the deliberate choice here: prove the engineering underneath, not
claim vendor experience that doesn't exist.

*Full technical writeup below, including the HMAC scheme, the AI validation discipline, and the
skills-to-features map. Skip ahead if you just want to see it work.*

## Architecture

```
Next.js App Router (Server Actions + Route Handlers)
        |
        |-- Postgres (Prisma) ---- customers, technicians, jobs, tickets,
        |                          automation rules + run log, webhook
        |                          configs + delivery log, daily briefings
        |
        |-- Gemini API ----------- ticket classification + daily briefings
        |                          (responseJsonSchema + Zod validation,
        |                           vendor-agnostic seam, see below)
        |
        |-- Tesseract.js --------- OCR on uploaded images, feeds the same
        |                          classification pipeline as a typed ticket
        |
        |-- Outgoing webhooks ---- signed POSTs on job status change
        |
        '-- Incoming webhooks ---- /api/integrations/* — what the real n8n
                                    workflow (integrations/n8n/) calls
```

Every page is a Server Component reading Postgres directly via Prisma. Mutations are Server
Actions colocated with their page (`actions.ts` files). The only real HTTP endpoints are the ones
that have to be: the Vercel Cron target, and `/api/integrations/*`, which machine callers like n8n
hit directly, they can't present a browser session cookie, so they're authenticated with HMAC
signatures instead (see `proxy.ts`).

## Tech choices, and why

- **Prisma, single-password session gate, Server Actions, shadcn/ui on Base UI, Postgres via
  Supabase** — same reasoning as the companion project
  ([ai-job-app-tracker](https://github.com/kabxxr7-jpg/ai-job-app-tracker)), not repeated here.
- **Tesseract.js over a cloud OCR API** for document intake — free, no account, no API key, keeps
  the "this app builds and runs with zero paid credentials" property intact. It's honest about
  what it proves: the OCR-to-LLM pipeline shape, not production-grade handwriting or non-English
  accuracy. A stronger engine (Google Document AI, AWS Textract) is a drop-in swap at one seam
  (`lib/ocr.ts`), the rest of the pipeline doesn't change.
- **A real n8n workflow, not an in-app clone** — the in-app automation engine (`/automations`)
  proves "I can design a trigger/filter/action data model and execution engine." Several real job
  postings this was built to answer want literal n8n experience, a different, specific claim that
  an in-app simulation doesn't honestly support. `integrations/n8n/` is a real, importable
  workflow that calls this app's own API.

## The automation engine: trigger → filter → action

`/automations` is a real rule builder, not a JSON editor. A rule has a trigger (`job.status_changed`
or `ticket.created`), optional filters (field/operator/value, all must match), and one or more
actions (`tag` or `webhook`). Every evaluation, whether it matched, was skipped by a filter, or an
action failed, writes an `AutomationRun` row, so the run history is a true audit log, not just a
count of successes.

## The AI feature: ticket classification + daily briefings

`lib/ai.ts` reads a ticket's raw text (typed, or OCR-extracted) and returns a category, priority,
summary, confidence score, and the exact source quote the classification is grounded on. The daily
briefing does the same at a higher level: reads a day's tickets and job activity, returns a
narrative summary plus cited highlights (opportunities, risks, follow-ups), each tagged to a real
ticket id.

This uses Gemini's structured-output mode, same discipline as the companion project: a Zod schema
is the source of truth, exported to JSON Schema for the model, and the response is validated
against that *same* schema before anything is trusted, schema-constrained output can still come
back malformed. Two things go further than that project did:

- **Grounding is checked, not just claimed.** The model is asked to quote an exact substring from
  the source text. The code then verifies that substring actually appears in the source, if it
  doesn't, confidence is forced down rather than trusting a hallucinated citation. Same check
  applies to the daily briefing's cited ticket ids, each one is verified against the real set of
  tickets sent to the model, not just assumed valid.
- **Vendor-agnostic by construction, not just by README claim.** The functions are named
  `classifyTicket` / `generateDailyBriefing`, not `classifyTicketWithGemini`. The one
  Gemini-specific thing, client construction and the model string, sits behind a single
  `getClient()` seam. This runs on Gemini for cost reasons (free tier, no card, this was a
  self-funded build). Several of the postings this project targets specifically want Claude API
  experience: the honest claim is that the structured-output-plus-validation pattern transfers
  directly to Claude's or OpenAI's equivalent modes, the same seam, the same discipline, a
  different `getClient()`. That's a true, checkable statement once you read the file. Claiming
  "built with Claude" would not be.

## The webhook feature: signed, logged, retried, both directions

Outbound (`lib/webhooks.ts`): a job reaching a configured status fires a signed POST, HMAC-SHA256
over `timestamp + "." + body`, logged whether it succeeds or fails, with a 30s → 5min → give-up
retry schedule swept by `/api/cron/retry-webhooks`, decoupled from the original request.

Inbound (`app/api/integrations/`): `/api/integrations/classify` and `/api/integrations/n8n-callback`
accept signed requests from external callers, verified with the same HMAC scheme in reverse
(`verifySignature()` in `lib/webhooks.ts`, so signing and verifying share one implementation, not
two that can drift apart), and reject anything incorrectly signed or stale. This was verified
directly: a correctly-signed request succeeds, a forged signature gets a 401, not a silent pass.

## The n8n workflow: a real artifact, not a simulation

`integrations/n8n/ticket-intake-workflow.json` is an actual, importable n8n workflow: a webhook
trigger, a validation step, a signed call to this app's classify endpoint, a confidence-based
branch (below threshold, it's flagged for manual review instead of auto-processing, "AI
recommends, a person decides" as an actual branch, not just a line in a proposal), and a signed
callback that creates the ticket. Full node-by-node writeup in `integrations/n8n/README.md`.

Every node type and parameter shape in that file was checked against n8n's own source repository,
not written from memory. What's genuinely verified: the JSON is correctly structured, the
JavaScript in its Code nodes is syntax-valid, and the exact HMAC signing logic those nodes run was
extracted and tested against this app's real, live endpoint. What's not independently verified:
the workflow running inside an actual n8n instance end to end, that needs a real n8n account to
confirm.

## Document intake: OCR → the same AI pipeline

`/intake` accepts a photo (a handwritten work order note, a scanned form). Tesseract.js extracts
the text server-side; that text goes straight into the same `classifyTicket()` function a typed
ticket uses, no separate AI path to maintain. The resulting ticket carries two confidence scores,
not one: OCR confidence (was the text itself read correctly) and AI confidence (is the
classification of that text correct), surfaced separately because they're different failure
modes, a low OCR score means the extracted text may be garbled before the AI even sees it.

## Skills demonstrated, mapped to what was actually asked for

| Built feature | The kind of posting it answers | Where to look |
|---|---|---|
| Automation rule engine + run log | "Zapier/ServiceTitan automation," general workflow-automation asks | `/automations`, `lib/automations.ts` |
| A real, exported n8n workflow calling this app's own API | "n8n Developer," "n8n AI Agent" postings | `integrations/n8n/` |
| Gemini structured extraction, grounded confidence, cited daily briefings | "AI/OpenAI integration," "daily management briefings from transcripts," hallucination-safeguard asks | `lib/ai.ts` |
| OCR intake feeding the same AI pipeline, two confidence scores, flagged for review | "OCR + LLM extraction + flag low-confidence for human review" (document/image ingestion postings) | `/intake`, `lib/ocr.ts` |
| HMAC-signed, retried, logged webhooks, both directions | "REST APIs," "webhooks, code steps, filters" | `lib/webhooks.ts`, `app/api/integrations/` |
| Vendor-agnostic AI seam (`getClient()`), one line to swap providers | "Claude API" / "OpenAI" postings where the actual vendor used differs | `lib/ai.ts` |

## Setup

```bash
cp .env.example .env   # DATABASE_URL, DIRECT_URL, GEMINI_API_KEY, APP_PASSWORD, SESSION_SECRET, N8N_CALLBACK_SECRET
npm install
npx prisma migrate dev
npm run db:seed
npm run dev
```

`.env.example` documents every variable and where to get it. `lib/env.ts` validates them at access
time with a clear error, not a scattering of unchecked `process.env.X` calls.

### Deploying

1. Create a Supabase project; pooled connection string as `DATABASE_URL`, direct connection string
   as `DIRECT_URL`.
2. Set every `.env.example` variable in Vercel's project settings, plus `CRON_SECRET` (any random
   string, Vercel sends it automatically as `Authorization: Bearer <CRON_SECRET>` on cron
   invocations, which `/api/cron/retry-webhooks` checks).
3. `npx prisma migrate deploy` against the production database, then `npm run db:seed` for
   non-empty demo data.
4. Deploy. `vercel.json`'s cron schedule runs once daily (`0 3 * * *`), Vercel's Hobby tier
   rejects any cron expression that would fire more than once per day, same constraint already
   documented in the companion project, confirmed there by an actual deploy rejection.

## Intentionally deferred

Cut for scope, and documented here on purpose rather than silently dropped:

- **Voice agents and genuine multi-agent/MCP tool-calling orchestration** — several target
  postings mention these, but each is independently a bigger build than everything else in this
  project combined. A shallow version (a browser speech-to-text demo, two sequential function
  calls relabeled "multi-agent") would read as padding to exactly the audience evaluating it.
  Pursuing postings that specifically need these is a separate, purpose-built demo, not a feature
  bolted onto a field-service ops app where it doesn't belong narratively.
- **Multi-user accounts** — single-password gate, no `userId` scoping, matching the companion
  project's single-user MVP scope.
- **Production-grade OCR** (handwriting, non-English, multi-page PDFs) — Tesseract.js proves the
  pipeline shape; a real deployment needing that accuracy swaps in Document AI/Textract at the
  `lib/ocr.ts` seam, not a redesign.
- **A real job/queue system** for webhook retries — the in-DB `nextRetryAt` + cron sweep is the
  right amount of infrastructure for this volume, same reasoning as the companion project.
