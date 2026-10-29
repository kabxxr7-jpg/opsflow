# Opsflow

**Live demo: [opsflow-ka-f1c5.vercel.app](https://opsflow-ka-f1c5.vercel.app)** — demo accounts
(real email+password logins, different roles) are listed right on the login screen.

A field-service ops automation and AI-reporting platform, built to demonstrate six specific
skills together in one cohesive app rather than six shallow demos: production-grade multi-tenant
auth with row-level isolation, a trigger/filter/action automation engine, AI classification with
hallucination safeguards, signed two-way webhooks, a real (not simulated) n8n workflow, and an
OCR-to-LLM document intake pipeline.

All data is seeded/simulated, there's no real ServiceTitan, GoHighLevel, or other field-service
platform account behind this. The architecture, how data flows in, how rules fire, how AI output
gets validated before it's trusted, how webhooks get delivered reliably, is built the way a real
integration would be. That's the deliberate choice here: prove the engineering underneath, not
claim vendor experience that doesn't exist.

*Full technical writeup below, including the HMAC scheme, the AI validation discipline, and the
skills-to-features map. Skip ahead if you just want to see it work.*

## The scenario

The demo is staged around **Riverside Home Services**, a fictional 3-person HVAC/electrical/
plumbing outfit. Tickets arrive by phone, chat, and email; Opsflow triages and prioritizes them,
dispatches technicians, and notifies the owner by webhook when a completed job clears $500. The
company is the only fictional part — `prisma/seed.ts` doesn't write placeholder "AI output" into
the database, it calls the real classification, automation, and briefing functions at seed time,
the same ones a live user triggers by clicking around. What's on `/briefings` and `/tickets` the
moment you log in is genuinely generated, not hand-authored to look good.

The demo also doesn't go stale. `/api/cron/simulate-day` (`lib/demo-simulation.ts`) runs once
daily: a couple of fresh tickets through the real classify pipeline, a job or two advanced to
completed (firing the real webhook rule), a new daily briefing, and old rows pruned so the data
doesn't grow unbounded. Visit today versus next week and the numbers have actually moved, because
the same real functions ran again, not because a bigger seed script was written.

## Architecture

```
Next.js App Router (Server Actions + Route Handlers)
        |
        |-- Auth (lib/auth.ts, lib/password.ts) -- scrypt-hashed passwords,
        |                          signed session cookie carrying
        |                          {userId, organizationId, role}
        |
        |-- Org-scoped Prisma (lib/db.ts) -- every tenant table carries
        |                          organizationId; a Prisma Client Extension
        |                          injects/verifies it on every query, so a
        |                          raw unscoped query simply can't happen
        |                          by accident
        |
        |-- Postgres (Prisma) ---- organizations, users, customers,
        |                          technicians, jobs, tickets, automation
        |                          rules + run log, webhook configs +
        |                          delivery log, daily briefings
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

- **Prisma, Server Actions, shadcn/ui on Base UI, Postgres via Supabase** — same reasoning as the
  companion project ([ai-job-app-tracker](https://github.com/kabxxr7-jpg/ai-job-app-tracker)), not
  repeated here. Auth itself is covered in its own section below, it's no longer the companion
  project's single-password gate.
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

## Multi-tenant auth: real isolation, not a login screen bolted on top

This is the part most "multi-user" demos get wrong: adding a login screen without actually
scoping the data behind it, so any authenticated user can still read or write any other tenant's
rows if they guess an id. Opsflow's isolation is enforced at the query layer, not the UI layer.

**Data model.** Every tenant-scoped table (`Customer`, `Technician`, `Job`, `Ticket`,
`AutomationRule`, `AutomationRun`, `WebhookConfig`, `WebhookDelivery`, `DailyBriefing`) carries a
non-nullable, indexed `organizationId` with `onDelete: Cascade`. There's no global singleton row
left over from the single-tenant version. `User` has a `role` (`OWNER | DISPATCHER | TECHNICIAN`)
and belongs to one `Organization`; `Job.assignedToId` links a job to the specific `User` account
allowed to view/update it, separate from `Job.technicianId` (the simulated field-crew roster shown
in the UI) on purpose — the demo's technician roster doesn't have to line up 1:1 with real login
accounts.

**Query isolation, automatic not opt-in.** `lib/db.ts` exports `getScopedDb()` (reads the current
session) and `getOrgDb(organizationId)` (for cron, which has no session and must iterate every
org). Both return a Prisma Client Extension that injects `organizationId` into every
`find`/`create`/`update`/`delete` call before it reaches Postgres — application code calls
`db.job.findMany()` same as always, it just can't see another tenant's rows, there's no separate
"scoped" query syntax to remember or forget. `findUnique`/`update`/`delete` take an id-shaped
`where` that can't have `organizationId` merged into it, so those get a post-fetch/pre-mutation
ownership check instead (verify the row belongs to this org, throw a generic not-found otherwise,
not a 403 that would confirm the row exists in someone else's org). The raw, unscoped Prisma
client (`rawDb`) exists only for cron's per-org iteration and auth's own user lookup (which
happens *before* there's a session to scope by) — regular app code never imports it directly.

**Authorization, separate from scoping.** Row-level org isolation answers "can this org see this
row at all"; `lib/authz.ts`'s `assertCan()` and `assertCanUpdateJob()` answer "can *this user*, in
*this role*, do *this specific thing*" within their own org. Automations and Settings are
owner-only (`assertCan(session, "manage:automations" | "manage:webhooks")`, enforced both as a
page-level gate and inside every Server Action, not just hidden nav links). A technician can
update the status of a job assigned to them (`assertCanUpdateJob`) but not someone else's job, and
their dashboard/jobs-list queries are filtered to `assignedToId: session.userId` so they
structurally can't see a coworker's jobs, not just UI-filtered after the fact.

**Passwords and sessions.** `lib/password.ts` hashes with Node's built-in `scrypt` (no extra
dependency) and verifies with `timingSafeEqual`. The session is a signed JWT cookie (`jose`,
`lib/auth.ts`) carrying `{userId, organizationId, role}` — every authorization decision reads from
that, nothing is re-derived from a client-supplied value. The login page's demo-account buttons
fill the email/password fields, they don't bypass the form; clicking one still goes through the
real `verifyPassword` → session-creation path.

**Cron, scoped per-organization.** Both Vercel Cron routes (`/api/cron/retry-webhooks`,
`/api/cron/simulate-day`) have no user session to scope by, so they fetch every `Organization` and
run their logic once per org via `getOrgDb(org.id)`, never a single global sweep across tenants.

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
| Multi-tenant auth, Prisma Client Extension for automatic org-scoping, role-based authorization | "Multi-user/multi-tenant SaaS," "role-based access control," security-conscious client work | `lib/db.ts`, `lib/authz.ts`, `lib/auth.ts` |
| Automation rule engine + run log | "Zapier/ServiceTitan automation," general workflow-automation asks | `/automations`, `lib/automations.ts` |
| A real, exported n8n workflow calling this app's own API | "n8n Developer," "n8n AI Agent" postings | `integrations/n8n/` |
| Gemini structured extraction, grounded confidence, cited daily briefings | "AI/OpenAI integration," "daily management briefings from transcripts," hallucination-safeguard asks | `lib/ai.ts` |
| OCR intake feeding the same AI pipeline, two confidence scores, flagged for review | "OCR + LLM extraction + flag low-confidence for human review" (document/image ingestion postings) | `/intake`, `lib/ocr.ts` |
| HMAC-signed, retried, logged webhooks, both directions | "REST APIs," "webhooks, code steps, filters" | `lib/webhooks.ts`, `app/api/integrations/` |
| Vendor-agnostic AI seam (`getClient()`), one line to swap providers | "Claude API" / "OpenAI" postings where the actual vendor used differs | `lib/ai.ts` |

## Setup

```bash
cp .env.example .env   # DATABASE_URL, DIRECT_URL, GEMINI_API_KEY, SESSION_SECRET, N8N_CALLBACK_SECRET
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
4. Deploy. `vercel.json` defines two cron jobs, both once-daily: `/api/cron/retry-webhooks`
   sweeps failed webhook deliveries, `/api/cron/simulate-day` keeps the live demo from going
   stale (creates a few fresh tickets/jobs through the real classify/automation pipeline,
   advances some jobs to completed, regenerates the daily briefing, prunes old rows). Vercel's
   Hobby tier rejects any cron expression that would fire more than once per day per job — same
   constraint as the companion project, confirmed there by an actual deploy rejection — but as of
   a 2026 Vercel change, Hobby now allows up to 100 distinct cron jobs per project (previously a
   much lower cap), so running two separate once-daily jobs is fine.

## Intentionally deferred

Cut for scope, and documented here on purpose rather than silently dropped:

- **Voice agents and genuine multi-agent/MCP tool-calling orchestration** — several target
  postings mention these, but each is independently a bigger build than everything else in this
  project combined. A shallow version (a browser speech-to-text demo, two sequential function
  calls relabeled "multi-agent") would read as padding to exactly the audience evaluating it.
  Pursuing postings that specifically need these is a separate, purpose-built demo, not a feature
  bolted onto a field-service ops app where it doesn't belong narratively.
- **Multi-organization (SaaS-style) self-serve onboarding** — the schema and the query-scoping
  layer already support any number of organizations (that's the whole point of the isolation work
  above), but there's no public signup flow that creates a new one; every org currently exists
  because `prisma/seed.ts` created it.
- **Production-grade OCR** (handwriting, non-English, multi-page PDFs) — Tesseract.js proves the
  pipeline shape; a real deployment needing that accuracy swaps in Document AI/Textract at the
  `lib/ocr.ts` seam, not a redesign.
- **A real job/queue system** for webhook retries — the in-DB `nextRetryAt` + cron sweep is the
  right amount of infrastructure for this volume, same reasoning as the companion project.
