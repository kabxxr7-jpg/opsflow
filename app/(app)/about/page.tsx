import { Code2, Sparkles, ShieldCheck, Layers, Compass, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const REPO_URL = "https://github.com/kabxxr7-jpg/opsflow";

const TLDR = [
  "Reads every incoming customer message and sorts it by urgency automatically, instead of someone having to do that by hand.",
  "Notifies you the moment a completed job is worth following up on — no one has to remember to flag it.",
  "Everything on this site is real: every classification, automation run, and briefing was produced by the actual AI and automation code, refreshed daily by a cron job — not written in to look good.",
  "This proves the automation + AI engine works end to end. Voice agents, multi-agent AI, and multi-user accounts aren't built — the technical sections below explain why, and what a real engagement would add.",
];

const STACK = [
  { name: "Next.js 16 (App Router) + TypeScript", why: "Server Components for every page, Server Actions for mutations." },
  { name: "Prisma + Postgres (Supabase)", why: "Schema-first, migration-tracked, pinned to Prisma 6." },
  { name: "Gemini (gemini-flash-lite-latest)", why: "Free tier, no card required — this was a self-funded build. See \"The AI model\" below for why that doesn't mean a thin wrapper." },
  { name: "Tesseract.js", why: "OCR with zero cloud account. Proves the pipeline shape, not production-grade accuracy — a real deployment swaps in Document AI/Textract at one seam." },
  { name: "shadcn/ui on Base UI + Tailwind v4", why: "Component primitives, not a page builder." },
  { name: "Vercel (hosting + cron)", why: "Two daily cron jobs: one retries failed webhook deliveries, one keeps this demo's data from going stale (see below)." },
];

const SCOPE_NEXT = [
  {
    title: "Voice agents and multi-agent/MCP orchestration",
    body: "Several job postings this was built to answer mention these, but each is independently a bigger build than everything in this project combined. A shallow version would read as padding to exactly the audience evaluating it — next step for a real engagement, not bolted onto this one.",
  },
  {
    title: "Multi-user accounts",
    body: "Single-password gate, no userId scoping, by design for a single-tenant demo. A real deployment adds proper auth and per-account data isolation at the Prisma/session layer — no architectural rework needed, just added scope.",
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
            Everything below this point is the technical detail behind those four lines, for
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
            <a href="/tickets" className="text-primary underline underline-offset-2">
              /tickets
            </a>{" "}
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
        <CardContent className="text-sm text-muted-foreground">
          A single shared password gates the whole app (a signed session cookie, see{" "}
          <code className="font-mono text-foreground">lib/auth.ts</code>), and there&apos;s
          intentionally no multi-tenancy — one <code className="font-mono text-foreground">Profile</code> row
          by design, not an oversight. That&apos;s the right scope for a single-tenant demo; a real
          deployment adds per-account auth and data isolation without needing an architectural
          rewrite.
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
