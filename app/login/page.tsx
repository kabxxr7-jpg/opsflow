"use client";

import { Suspense, useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Workflow, Bell, Inbox, History, Code2, Info } from "lucide-react";
import { login } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SCENARIO } from "@/lib/scenario";

const REPO_URL = "https://github.com/kabxxr7-jpg/opsflow";

const PITCH_POINTS = [
  {
    icon: Bell,
    text: "The moment a job worth over $500 wraps up, you're notified automatically — nobody has to remember to tell you.",
  },
  {
    icon: Inbox,
    text: "Every incoming message is read and sorted the moment it arrives, and the AI says so itself when it's unsure, instead of guessing.",
  },
  {
    icon: History,
    text: "Runs quietly in the background and keeps a full record of everything it did, so nothing falls through the cracks.",
  },
];

// Real login accounts, created by prisma/seed.ts with real hashed passwords — not a bypass.
// Listed here so a visitor can see the real multi-user/role boundary exists without needing
// us to tell them a password over email first.
const DEMO_ACCOUNTS = [
  { email: "owner@riverside.demo", role: "Owner", note: "sees everything, manages automations/webhooks" },
  { email: "tech1@riverside.demo", role: "Technician", note: "sees only their own assigned jobs" },
];
const DEMO_PASSWORD = "opsflow-demo-2026";

// Where the proxy bounced the visitor from, so signing in lands them back there. Read inside its
// own Suspense boundary because useSearchParams opts its subtree out of static rendering.
function ReturnToField() {
  const from = useSearchParams().get("from");
  return from ? <input type="hidden" name="from" value={from} /> : null;
}

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);

  // Focus the email field on desktop only: on a phone, autofocus raises the keyboard over the
  // sign-in button and the demo accounts before anyone has seen the page.
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) emailRef.current?.focus();
  }, []);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Brand panel — desktop only. Deliberately not theme-reactive (stays this gradient in
          light and dark site mode) so it reads as a fixed brand moment, not a themed surface. */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[oklch(0.3_0.13_262)] via-[oklch(0.42_0.16_262)] to-[oklch(0.27_0.11_250)] px-10 py-12 text-primary-foreground md:flex md:w-[44%] md:flex-col md:justify-between lg:w-[42%] lg:px-14 lg:py-16 xl:w-[38%]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "24px 24px" }}
        />
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-20 size-72 rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-16 size-80 rounded-full bg-[var(--chart-3)]/25 blur-3xl" />

        <div className="relative space-y-9">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 backdrop-blur-sm">
              <Workflow className="size-5" aria-hidden />
            </span>
            <span className="font-display text-lg font-medium tracking-tight">Opsflow</span>
          </div>

          <div className="max-w-md space-y-3">
            <h1 className="font-display text-4xl leading-[1.1] font-medium tracking-tight lg:text-[2.6rem]">
              Field-service ops,
              <br />
              actually under control.
            </h1>
            <p className="text-sm leading-relaxed text-primary-foreground/85">
              Staged around <span className="font-medium text-primary-foreground">{SCENARIO.company}</span>,{" "}
              {SCENARIO.description}
            </p>
          </div>

          <div className="grid max-w-md grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/15 bg-white/[0.07] p-3 backdrop-blur-sm">
              <p className="mb-2 text-xs font-medium text-primary-foreground/80">Before</p>
              <div className="space-y-1.5">
                <div className="h-2 w-full rounded bg-white/15" />
                <div className="h-2 w-5/6 rounded bg-white/15" />
                <div className="h-2 w-full rounded bg-white/15" />
                <div className="h-2 w-4/6 rounded bg-white/15" />
              </div>
              <p className="mt-2.5 text-xs text-primary-foreground/80">
                12 unread messages, no priority, nobody&apos;s watching for the big one.
              </p>
            </div>
            <div className="rounded-xl border border-white/25 bg-white/[0.12] p-3 backdrop-blur-sm">
              <p className="mb-2 text-xs font-medium text-primary-foreground">With Opsflow</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="size-1.5 shrink-0 rounded-full bg-[var(--chart-4)]" />
                  <div className="h-2 flex-1 rounded bg-[var(--chart-4)]/30" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="size-1.5 shrink-0 rounded-full bg-[var(--chart-3)]" />
                  <div className="h-2 flex-1 rounded bg-[var(--chart-3)]/30" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="size-1.5 shrink-0 rounded-full bg-[var(--chart-2)]" />
                  <div className="h-2 flex-1 rounded bg-[var(--chart-2)]/30" />
                </div>
              </div>
              <p className="mt-2.5 text-xs font-medium text-primary-foreground">
                3 urgent · 2 follow-ups · owner notified on a $810 job.
              </p>
            </div>
          </div>

          <ul className="max-w-md space-y-3">
            {PITCH_POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-2.5 text-sm text-primary-foreground/85">
                <Icon className="mt-0.5 size-4 shrink-0 text-primary-foreground/90" aria-hidden />
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative max-w-md text-sm font-medium text-primary-foreground/90">
          This isn&apos;t a mockup — real accounts, real roles, real org-scoped data isolation (see{" "}
          <Link href="/about" className="underline underline-offset-2 hover:text-white">
            /about
          </Link>
          ).
        </p>
      </aside>

      {/* Form panel */}
      <main className="flex flex-1 items-center justify-center bg-background px-6 py-12">
        <div className="animate-fade-up w-full max-w-sm space-y-7">
          <div className="flex items-center gap-2.5 md:hidden">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Workflow className="size-4.5" aria-hidden />
            </span>
            <span className="font-display text-lg font-medium tracking-tight">Opsflow</span>
          </div>

          <div className="space-y-1.5">
            {/* The brand panel's h1 is hidden on small screens, so the form needs its own there. */}
            <h1 className="font-display text-2xl font-medium tracking-tight md:hidden">Sign in</h1>
            <h2 className="hidden font-display text-2xl font-medium tracking-tight md:block">Sign in</h2>
            <p className="text-sm text-muted-foreground">Field-service ops automation + AI reporting demo.</p>
          </div>

          <div className="space-y-1.5 rounded-xl border bg-muted/40 p-3">
            <p className="text-xs font-medium text-foreground">Demo accounts</p>
            {DEMO_ACCOUNTS.map((acct) => (
              <button
                key={acct.email}
                type="button"
                onClick={() => {
                  setEmail(acct.email);
                  setPassword(DEMO_PASSWORD);
                }}
                className="flex min-h-10 w-full flex-wrap items-center justify-between gap-x-3 rounded-lg px-2 py-2 text-left text-xs transition-colors hover:bg-background"
              >
                <span>
                  <span className="font-medium text-foreground">{acct.role}</span>{" "}
                  <span className="text-muted-foreground">— {acct.note}</span>
                </span>
                <span className="font-mono text-muted-foreground">{acct.email}</span>
              </button>
            ))}
            <p className="px-2 text-[11px] text-muted-foreground">
              Password for both: <code className="font-mono">{DEMO_PASSWORD}</code> — clicking an account fills the
              form, it does not skip real authentication.
            </p>
          </div>

          <form action={formAction} className="space-y-4">
            <Suspense fallback={null}>
              <ReturnToField />
            </Suspense>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                ref={emailRef}
                autoComplete="username"
                inputMode="email"
                spellCheck={false}
                className="h-10"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="h-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {state?.error ? <p role="alert" className="text-sm text-destructive-text">{state.error}</p> : null}
            <Button type="submit" size="lg" className="h-10 w-full" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="flex items-center justify-center gap-4 border-t pt-5 text-xs text-muted-foreground">
            <Link href="/about" className="inline-flex min-h-8 items-center gap-1.5 hover:text-foreground">
              <Info className="size-3.5" aria-hidden />
              What is this?
            </Link>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-8 items-center gap-1.5 hover:text-foreground"
            >
              <Code2 className="size-3.5" aria-hidden />
              Source on GitHub
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
