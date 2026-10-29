# Opsflow

**Live demo: [opsflow-ka-f1c5.vercel.app](https://opsflow-ka-f1c5.vercel.app)** — demo accounts
(real email+password logins, different roles) are listed right on the login screen.

A field-service ops automation and AI-reporting platform, built to demonstrate six specific
skills together in one cohesive app rather than six shallow demos: production-grade multi-tenant
auth with row-level isolation, a trigger/filter/action automation engine, AI classification with
hallucination safeguards, signed two-way webhooks, an importable n8n workflow file (not yet run inside n8n), and an
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
        '-- Incoming webhooks ---- /api/integrations/* — what the n8n
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
- **An n8n workflow file, not an in-app clone** — the in-app automation engine (`/automations`)
  proves "I can design a trigger/filter/action data model and execution engine." Several real job
  postings this was built to answer want literal n8n experience, a different, specific claim that
  an in-app simulation doesn't honestly support. `integrations/n8n/` is an importable
  workflow (hand-written, not yet run inside n8n) that calls this app's own API.

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

**Query isolation, automatic not opt-in.** `lib/db.ts` exports `getScopedDb()` (reads the session)
and `getOrgDb(organizationId)` (for cron, which has no session). Both return a Prisma Client
Extension that intercepts every operation. The rules are derived from the Prisma schema at runtime
(`Prisma.dmmf`), not from hand-maintained lists: any model with an `organizationId` is a tenant
model, and any scalar backing a relation is a foreign key. Adding a tenant table scopes it
automatically — and adding a table *without* an `organizationId` makes the scoped client refuse it
until someone decides what it means (it fails closed). Application code calls `db.job.findMany()`
exactly as it always would; there's no separate "scoped" syntax to remember or forget.

- Reads, updates and deletes get the tenant filter AND-ed onto the caller's `where` — it
  intersects with what the caller asked for, never replaces it. That includes `findUnique`,
  `update` and `delete`, because Prisma's unique-where accepts extra non-unique conditions.
- Creates always stamp the caller's `organizationId` (whatever was passed is discarded), and
  updates can't change it.
- Every foreign key written (a job's customer, a ticket's job, a job's assignee) is checked to
  point at a row in the *same* organization, so a row can't be attached to someone else's.
- Nested relation writes (`connect`/`create` through a relation field) are rejected, since they
  would be a way around those checks. Raw SQL (`$queryRaw` and friends) is not offered on the
  scoped client, and neither are the `User` and `Organization` models — including through a
  relation: every `include`/`select`, however deeply nested, is walked, so
  `job.findMany({ include: { assignedTo: true } })` can't hand back a password hash either.
- ESLint (`eslint.config.mjs`) bans importing the raw client anywhere except the few files that
  legitimately have no tenant to scope by (login, cron, the signed integration endpoints, seed,
  tests), so the guarantee can't erode by accident.

`tests/isolation.test.ts` is the proof rather than the claim: a client scoped to organization A
tries to read, update, delete, create into, link to and move rows belonging to organization B, and
each attempt is checked through the raw client to confirm B's data is untouched.

**Authorization, separate from scoping.** Org isolation answers "can this organization see this
row at all"; `lib/authz.ts` answers "can *this role* do *this thing*". The whole role matrix is one
table (`GRANTS`) that both the UI (which nav links appear, which dashboard widgets render) and the
Server Actions read, so the two can't drift apart:

| | Owner | Dispatcher | Technician |
|---|---|---|---|
| Jobs: view, change status | all jobs | all jobs | only jobs assigned to them |
| Tickets: view, create, classify | yes | yes | yes (a ticket can only be attached to a job assigned to them) |
| Photo intake (OCR) | yes | yes | yes |
| Briefings: view, generate | yes | yes | no |
| Automations and Settings (webhooks) | yes | no | no |

Anything not granted is denied, and every Server Action calls `assertCan()` itself — not just the
page — so a hidden link is never the only protection. Tickets and intake are open to technicians on
purpose (a tech in the field can log a customer's message or photograph a work order), but that's a
line in the matrix rather than an accident; narrowing it is a one-line change. The technician rule is row-level, so it
lives next to the query: job lists are filtered to `assignedToId` in the query itself, and
`assertCanUpdateJob()` checks the specific row. `tests/authz.test.ts` pins the full matrix.

**Passwords and sessions.** `lib/password.ts` hashes with Node's built-in `scrypt` (no extra
dependency) and verifies with `timingSafeEqual`. Login does a full scrypt even for an email with no
account, so response time doesn't reveal which emails exist, and the post-login redirect only
honours same-site paths. The session is a signed JWT cookie (`jose`, `lib/auth.ts`) carrying
`{userId, organizationId, role}` — every authorization decision reads from that, nothing is
re-derived from a client-supplied value. The login page's demo-account buttons fill the
email/password fields, they don't bypass the form; clicking one still goes through the real
`verifyPassword` → session-creation path.

**Cron, scoped per-organization.** Both Vercel Cron routes (`/api/cron/retry-webhooks`,
`/api/cron/simulate-day`) have no user session to scope by, so they fetch every `Organization` and
run their logic once per org via `getOrgDb(org.id)`, never a single global sweep across tenants. One
organization failing doesn't abort the others, and in production a missing `CRON_SECRET` locks the
endpoints rather than opening them. The daily simulation (which invents activity and prunes old rows)
runs only for the demo organization named in `lib/scenario.ts`, so a real tenant added later is never
touched by it; the webhook retry sweep covers every organization.

## The automation engine: trigger → filter → action

`/automations` is a real rule builder, not a JSON editor. A rule has a trigger (`job.status_changed`
or `ticket.created`), optional filters (field/operator/value, all must match), and one or more
actions (`tag` or `webhook`). Every evaluation, whether it matched, was skipped by a filter, or an
action failed, writes an `AutomationRun` row, so the run history is a true audit log, not just a
count of successes. Rule definitions are stored as JSON, so they're re-validated on every run
rather than trusted: a malformed rule is logged as a failed run and skipped, and can't take the
rest of the organization's automations (or the job update that triggered them) down with it.

## The AI feature: ticket classification + daily briefings

`lib/ai.ts` reads a ticket's raw text (typed, or OCR-extracted) and returns a category, priority,
summary, confidence score, and the exact source quote the classification is grounded on. The daily
briefing does the same at a higher level: reads a day's tickets and job activity, returns a
narrative summary plus cited highlights (opportunities, risks, follow-ups), each tagged to a real
ticket id. The figures shown above each briefing (jobs completed, revenue) come straight from the
database, over the same 24-hour window the model was given — and the narrative isn't allowed to
state numbers of its own: a check rejects a summary that does, retries once with a correction, and
as a last resort drops the offending sentences. A model told "don't quote figures" will still
occasionally do it, and "18 jobs completed" printed under a header saying 2 is exactly the failure
a hallucination-safeguards project can't ship.

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
  self-funded build). Several of the postings this project targets name a specific model vendor:
  the honest claim is that the structured-output-plus-validation pattern transfers to other
  providers' equivalent modes (OpenAI's, for example), the same seam, the same discipline, a
  different `getClient()`. That's a true, checkable statement once you read the file. Claiming
  experience with a vendor that is not used here would not be.

## The webhook feature: signed, logged, retried, both directions

Outbound (`lib/webhooks.ts`): a job reaching a configured status fires a signed POST, HMAC-SHA256
over `timestamp + "." + body`, logged whether it succeeds or fails, with a 30s → 5min → give-up
retry schedule swept by `/api/cron/retry-webhooks`, decoupled from the original request. A failed
attempt is *claimed* when it's retried, so a later sweep can't re-send an event that a retry
already delivered.

Anyone who can configure an endpoint can make the server send a request, so the target is checked
twice (`lib/safe-url.ts`): when it's saved, and again at connect time through a custom DNS
`lookup`, so DNS rebinding can't swap in a private address afterwards. Only public https addresses
on standard ports are accepted; loopback, private, link-local, cloud-metadata, IPv4-mapped IPv6,
NAT64, 6to4 and IPv4-compatible ranges are refused; redirects are never followed. The whole delivery
has one hard deadline (an endpoint that trickles bytes can't hold it open) and only the first few
KB of a response are read. A failed delivery older than 36 hours is closed out rather than re-sent
if its endpoint is switched back on.
Signing secrets are write-only — never rendered back to the browser after saving.

Inbound (`app/api/integrations/`): `/api/integrations/classify` and `/api/integrations/n8n-callback`
accept signed requests from external callers, verified with the same HMAC scheme in reverse
(`verifySignature()` in `lib/webhooks.ts`, so signing and verifying share one implementation, not
two that can drift apart), and reject anything incorrectly signed or stale.
`/api/integrations/test-echo` is a real receiver for this app's own webhooks, so the whole
sign → deliver → verify loop can be demonstrated end to end: it recomputes the HMAC, compares in
constant time, enforces the 5-minute replay window, and answers 401 to anything that doesn't
verify (`tests/test-echo.test.ts` covers a forged signature, a tampered body and a replay).

## The n8n workflow: a hand-written artifact, not yet run in n8n

`integrations/n8n/ticket-intake-workflow.json` is an importable n8n workflow file: a webhook
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
modes, a low OCR score means the extracted text may be garbled before the AI even sees it. Uploads
are identified by their leading bytes rather than the filename or declared type, and large phone
photos are shrunk in the browser before upload, so an ordinary camera shot doesn't hit the
request-size limit.

## Skills demonstrated, mapped to what was actually asked for

| Built feature | The kind of posting it answers | Where to look |
|---|---|---|
| Multi-tenant auth, Prisma Client Extension for automatic org-scoping, role-based authorization | "Multi-user/multi-tenant SaaS," "role-based access control," security-conscious client work | `lib/db.ts`, `lib/authz.ts`, `lib/auth.ts` |
| Automation rule engine + run log | "Zapier/ServiceTitan automation," general workflow-automation asks | `/automations`, `lib/automations.ts` |
| An importable n8n workflow file (hand-written, not yet run in n8n) calling this app's own API | "n8n Developer," "n8n AI Agent" postings | `integrations/n8n/` |
| Gemini structured extraction, grounded confidence, cited daily briefings | "AI/OpenAI integration," "daily management briefings from transcripts," hallucination-safeguard asks | `lib/ai.ts` |
| OCR intake feeding the same AI pipeline, two confidence scores, flagged for review | "OCR + LLM extraction + flag low-confidence for human review" (document/image ingestion postings) | `/intake`, `lib/ocr.ts` |
| HMAC-signed, retried, logged webhooks, both directions | "REST APIs," "webhooks, code steps, filters" | `lib/webhooks.ts`, `app/api/integrations/` |
| All AI calls live in `lib/ai.ts`, so a provider swap touches one file | Postings that name a vendor other than Gemini | `lib/ai.ts` |

## Tests

`npm test` runs 200+ tests with Node's built-in runner (`node:test` through `tsx`, no framework
dependency). The database-backed ones run against a local Postgres only — they refuse a non-local
`DATABASE_URL` — and create and remove throwaway organizations.

| Area | What's pinned down |
|---|---|
| Tenant isolation (`isolation.test.ts`) | Cross-organization reads, writes, deletes, moves, foreign keys, nested writes, raw SQL |
| Roles (`authz.test.ts`) | The full role × action matrix and the technician row-level rule |
| SSRF guard (`safe-url.test.ts`) | Blocked and allowed address ranges, URL rules, the connect-time DNS check |
| Webhooks (`webhooks.test.ts`, `test-echo.test.ts`) | Signing, the replay window, delivery to a real local server, retries, blocked targets, the receiver rejecting forgeries |
| Rule engine (`automations.test.ts`) | Filter semantics; a malformed rule is logged and doesn't take the others down |
| Validation (`validation.test.ts`) | Rule, webhook, ticket and job input schemas; post-login redirect safety |
| Deletion (`cleanup.test.ts`) | Removing a rule or endpoint that has history; can't touch another organization's |
| AI guardrails (`briefing.test.ts`) | The briefing narrative can't state figures; the stats window |

What they don't cover: the browser UI (checked by hand, plus a contrast/accessibility sweep in
light and dark at desktop and phone widths — not automated), and the live Gemini and Tesseract
calls (the validation around them is tested; the calls themselves need keys and binaries).

## A performance note worth knowing about

Next's Cache Components are on, but **Partial Prefetching is deliberately off**. Measured on a
production build with the database's statement log: with it on, a single request ran a page's
server code twice and every sidebar link's prefetch executed the real queries for the page it
pointed at — one dashboard view cost 52 queries across the seven linked pages, which is how the
connection pool got exhausted on the live site. With it off, a request runs the page once (13
queries for the dashboard) and prefetches stop at the route's `loading.tsx` skeleton, running no page
code. Each route has its own `loading.tsx`, so a click shows the skeleton immediately. Next's build
output recommends enabling the flag and says it becomes the default in the next major release —
re-measure when upgrading.

## Hardening, and what's still open

Done: Server Actions validate input with Zod and return failures as values (production masks
thrown messages); the AI and OCR actions are rate-limited per organization, because the login page
publishes working demo credentials; responses carry `nosniff`, frame-deny, HSTS, referrer and
permissions headers; the cron endpoints fail closed.

Open, deliberately: the per-organization rate limits are check-then-act, so a burst of parallel
requests can overshoot them slightly, and re-classifying a ticket whose first classification failed isn't throttled at all
(they protect the free AI quota; they aren't a security boundary); the webhook retry backoff (30 s, then 5 min) is a floor, not a schedule, because the
sweep only runs when the daily cron does; and there is **no Content-Security-Policy** (Next injects inline scripts, so a
useful policy needs per-request nonces); throttles are per organization, not per IP, and login has
no lockout; sessions are 30-day stateless JWTs with no server-side revocation; and the live demo
database was migrated by applying SQL directly, so it has no `_prisma_migrations` history — baseline
it (`prisma migrate resolve --applied …`) before ever running `migrate deploy` against it.

## Setup

```bash
cp .env.example .env   # DATABASE_URL, DIRECT_URL, GEMINI_API_KEY, SESSION_SECRET, N8N_CALLBACK_SECRET
npm install
npx prisma migrate dev
npm run db:seed
npm run dev
```

Other scripts: `npm test` (see above — point `DATABASE_URL` at a local database first), `npm run lint`
(includes the rule that keeps the raw Prisma client out of application code), `npm run build`.

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
