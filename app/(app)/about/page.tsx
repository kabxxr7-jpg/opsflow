import type { Metadata } from "next";
import Link from "next/link";
import { Code2, Sparkles, ShieldCheck, Layers, Compass, CheckCircle2, Lock, FlaskConical } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const REPO_URL = "https://github.com/kabxxr7-jpg/opsflow";

const TLDR = [
  "Reads every incoming customer message and sorts it by urgency automatically, instead of someone having to do that by hand.",
  "Notifies you the moment a completed job is worth following up on — no one has to remember to flag it.",
  "Everything on this site is real: every classification, automation run, and briefing was produced by the actual AI and automation code, refreshed daily by a cron job — not written in to look good.",
  "Real multi-user accounts with role-based access: an Owner sees everything, Technicians only see their own assigned jobs — enforced at the database query layer, not just hidden in the UI.",
  "Each company's data is walled off from every other's, and there's an automated test suite (200+ tests) that actively tries to break that wall — reading, changing, and reaching into another company's records.",
];

const STACK = [
  { name: "Next.js 16 (App Router) + TypeScript", why: "Server Components for every page, Server Actions for mutations." },
  { name: "Prisma + Postgres (Supabase)", why: "Schema-first, migration-tracked, pinned to Prisma 6." },
  { name: "Gemini (gemini-flash-lite-latest)", why: "Free tier, no card required — this was a self-funded build. See \"The AI model\" below for why that doesn't mean a thin wrapper." },
  { name: "Tesseract.js", why: "OCR with zero cloud account. Proves the pipeline shape, not production-grade accuracy — a real deployment swaps in Document AI/Textract at one seam." },
  { name: "Zod", why: "One schema per boundary: the AI's output, every Server Action's input, and the stored automation rules are all parsed rather than trusted." },
  { name: "node:test + tsx", why: "200+ tests with Node's built-in runner and no framework dependency; the isolation and webhook tests run against a real local Postgres and a real local HTTP server." },
  { name: "shadcn/ui on Base UI + Tailwind v4", why: "Component primitives, not a page builder." },
  { name: "Vercel (hosting + cron)", why: "Two daily cron jobs: one retries failed webhook deliveries, one keeps this demo's data from going stale (see below)." },
];

const SCOPE_NEXT = [
  {
    title: "Voice agents and multi-agent/MCP orchestration",
    body: "Several job postings this was built to answer mention these, but each is independently a bigger build than everything in this project combined. A shallow version would read as padding to exactly the audience evaluating it — next step for a real engagement, not bolted onto this one.",
  },
  {
    title: "Multi-organization (SaaS-style) onboarding",
    body: "The schema and query-scoping layer (lib/db.ts) already support any number of organizations — every tenant table carries organizationId, and a Prisma Client Extension injects it on every query automatically. What's not built is self-serve signup; today, organizations are created by seed.ts, not a signup flow.",
  },
  {
    title: "Production-grade OCR",
    body: "Tesseract.js proves the OCR-to-LLM pipeline shape. A real deployment handling real handwriting or non-English text swaps in Google Document AI or AWS Textract at the lib/ocr.ts seam.",
  },
  {
    title: "A real job/queue system for webhook retries",
    body: "The in-DB nextRetryAt + cron sweep is the right amount of infrastructure for this volume. A high-throughput deployment would move this to a proper queue (SQS, BullMQ).",
  },
];

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight">About this project</h1>
          <p className="text-sm text-muted-foreground">
            What&apos;s real, what&apos;s simulated, and why it was built this way.
          </p>
        </div>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Code2 className="size-4" aria-hidden />
          View source on GitHub
        </a>
      </div>

      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <CardTitle className="text-base">In plain terms</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2.5">
            {TLDR.map((line) => (
              <li key={line} className="flex items-start gap-2.5 text-sm text-foreground">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                {line}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Everything below this point is the technical detail behind those lines, for
            anyone who wants to verify the claims rather than take them on faith.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="size-4 text-primary" aria-hidden />
            Tech stack, and why
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {STACK.map((item) => (
            <div key={item.name} className="text-sm">
              <p className="font-medium text-foreground">{item.name}</p>
              <p className="text-muted-foreground">{item.why}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-primary" aria-hidden />
            The AI model, and what&apos;s actually validated
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Ticket classification and daily briefings run on Gemini&apos;s structured-output mode
            (<code className="font-mono text-foreground">responseJsonSchema</code>): a Zod schema
            is the source of truth, exported to JSON Schema for the model, and the response is
            validated against that same schema before anything touches the database — schema-
            constrained output can still come back malformed, so it&apos;s never trusted blind.
          </p>
          <p>
            Beyond schema validation, every classification is <strong className="text-foreground">grounding-checked</strong>:
            the model has to quote an exact substring from the source text, and the code verifies
            that substring actually appears there. If it doesn&apos;t, confidence is automatically
            capped and the ticket flagged &ldquo;needs review.&rdquo; This runs on every classification,
            every time — since classification is a real, non-deterministic model call rather than
            scripted output, a flagged ticket won&apos;t always be sitting on{" "}
            <Link href="/tickets" className="text-primary underline underline-offset-2">
              /tickets
            </Link>{" "}
            when you look, but when one is, that&apos;s this safeguard working, not a sign the AI
            is unreliable.
          </p>
          <p>
            The code is vendor-agnostic by construction, not just by claim:{" "}
            <code className="font-mono text-foreground">classifyTicket()</code> and{" "}
            <code className="font-mono text-foreground">generateDailyBriefing()</code> are named
            for what they do, not for Gemini. The one vendor-specific piece sits behind a single{" "}
            <code className="font-mono text-foreground">getClient()</code> seam in{" "}
            <code className="font-mono text-foreground">lib/ai.ts</code>. It runs on Gemini&apos;s
            free tier (<code className="font-mono text-foreground">gemini-flash-lite-latest</code>,
            no card required) for cost reasons — the structured-output-plus-validation pattern
            transfers directly to Claude&apos;s or OpenAI&apos;s equivalent modes, same seam, same
            discipline.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            Auth model
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Real accounts, real roles: scrypt-hashed passwords (<code className="font-mono text-foreground">lib/password.ts</code>,
            Node&apos;s built-in crypto, no extra dependency), a signed session cookie carrying{" "}
            <code className="font-mono text-foreground">{"{ userId, organizationId, role }"}</code> (<code className="font-mono text-foreground">lib/auth.ts</code>),
            and three roles — <strong className="text-foreground">Owner</strong> (full access),{" "}
            <strong className="text-foreground">Dispatcher</strong>, and{" "}
            <strong className="text-foreground">Technician</strong> (own assigned jobs only).
          </p>
          <p>
            Isolation is enforced where it actually matters — the query, not the page. A Prisma
            Client Extension (<code className="font-mono text-foreground">lib/db.ts</code>{"'s"}{" "}
            <code className="font-mono text-foreground">getScopedDb()</code>) adds the session&apos;s
            organization to every read, write, and delete on every tenant table, stamps it on every
            create, and checks that every record you link to is in the same organization. Its rules
            are derived from the Prisma schema itself, so a new table is scoped automatically — and
            a table it doesn&apos;t understand is refused, not waved through. Raw SQL isn&apos;t
            available on it, and a lint rule keeps the unscoped client out of application code.
          </p>
          <p>
            Roles are one table in <code className="font-mono text-foreground">lib/authz.ts</code>{" "}
            that both the UI and the Server Actions read: Owners get everything; Dispatchers get jobs
            and briefings; Technicians get only the jobs assigned to them (filtered in the query
            itself, and re-checked per row on update). Every Server Action checks its own
            permission, so the check can&apos;t be bypassed by calling the action directly.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="size-4 text-primary" aria-hidden />
            Hardening, and what&apos;s still open
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Outbound webhooks can only target public https addresses — checked when saved and again
            when connecting, so a hostname can&apos;t be switched to an internal address afterwards
            (SSRF and DNS-rebinding protection). Signing secrets are write-only: once saved they&apos;re
            never shown again. Server Actions validate their input and return errors instead of
            crashing. The AI and OCR actions are rate-limited per organization, because this login
            page publishes working demo credentials. The built-in webhook receiver verifies
            signatures, and rejects forged, tampered, and replayed requests.
          </p>
          <p>
            <strong className="text-foreground">Not done, on purpose:</strong> there is no
            Content-Security-Policy yet (Next injects inline scripts, so a useful one needs
            per-request nonces); rate limits are per organization rather than per IP, and login has
            no lockout; sessions are 30-day signed tokens with no server-side revocation.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="size-4 text-primary" aria-hidden />
            What&apos;s tested
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <code className="font-mono text-foreground">npm test</code> runs 200+ tests: cross-tenant
            attack attempts against a real database, the full role matrix, the SSRF address rules,
            webhook delivery to a real local server (signing, retries, blocked targets), the rule
            engine including malformed rules, input validation, and the guard that stops the AI
            briefing from stating figures. The browser UI is checked by hand and with a
            contrast/accessibility sweep, not automated, and the live Gemini and OCR calls aren&apos;t
            part of the suite. Full table in the{" "}
            <a href={`${REPO_URL}#tests`} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
              README
            </a>
            .
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Compass className="size-4 text-primary" aria-hidden />
            Scope, and what&apos;s next
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {SCOPE_NEXT.map((item) => (
            <div key={item.title} className="text-sm">
              <p className="font-medium text-foreground">{item.title}</p>
              <p className="text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
