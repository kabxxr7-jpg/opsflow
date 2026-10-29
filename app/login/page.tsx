"use client";

import { useActionState, useState } from "react";
import { Workflow, Bell, Inbox, History, Code2, Info } from "lucide-react";
import { login } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-secondary/40 to-background p-4">
      <div className="grid w-full max-w-3xl gap-8 md:grid-cols-2 md:items-center">
        <div className="hidden space-y-5 md:block">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Workflow className="size-5" aria-hidden />
          </span>
          <div className="space-y-2">
            <h1 className="font-display text-3xl font-medium tracking-tight">Opsflow</h1>
            <p className="text-sm text-muted-foreground">
              Staged around <span className="font-medium text-foreground">{SCENARIO.company}</span>,{" "}
              {SCENARIO.description}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border bg-card p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Before</p>
              <div className="space-y-1.5">
                <div className="h-2 w-full rounded bg-muted" />
                <div className="h-2 w-5/6 rounded bg-muted" />
                <div className="h-2 w-full rounded bg-muted" />
                <div className="h-2 w-4/6 rounded bg-muted" />
              </div>
              <p className="mt-2.5 text-xs text-muted-foreground">
                12 unread messages, no priority, nobody&apos;s watching for the big one.
              </p>
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="mb-2 text-xs font-medium text-primary">With Opsflow</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="size-1.5 shrink-0 rounded-full bg-destructive" />
                  <div className="h-2 flex-1 rounded bg-destructive/20" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="size-1.5 shrink-0 rounded-full bg-[var(--chart-3)]" />
                  <div className="h-2 flex-1 rounded bg-[var(--chart-3)]/25" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="size-1.5 shrink-0 rounded-full bg-[var(--chart-2)]" />
                  <div className="h-2 flex-1 rounded bg-[var(--chart-2)]/25" />
                </div>
              </div>
              <p className="mt-2.5 text-xs font-medium text-foreground">
                3 urgent · 2 follow-ups · owner notified on a $810 job.
              </p>
            </div>
          </div>
          <ul className="space-y-3">
            {PITCH_POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                {text}
              </li>
            ))}
          </ul>
          <p className="text-sm font-medium text-foreground">
            This isn&apos;t a mockup — real accounts, real roles, real org-scoped data isolation
            (see{" "}
            <a href="/about" className="underline underline-offset-2 hover:text-primary">
              /about
            </a>
            ).
          </p>
        </div>

        <Card className="w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 md:hidden">
              <Workflow className="size-5 text-primary" aria-hidden />
              Opsflow
            </CardTitle>
            <CardTitle className="hidden md:block">Sign in</CardTitle>
            <CardDescription>Field-service ops automation + AI reporting demo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5 rounded-md border bg-muted/30 p-2.5">
              <p className="text-xs font-medium text-foreground">Demo accounts</p>
              {DEMO_ACCOUNTS.map((acct) => (
                <button
                  key={acct.email}
                  type="button"
                  onClick={() => {
                    setEmail(acct.email);
                    setPassword(DEMO_PASSWORD);
                  }}
                  className="flex w-full items-center justify-between rounded px-1.5 py-1 text-left text-xs transition-colors hover:bg-accent"
                >
                  <span>
                    <span className="font-medium text-foreground">{acct.role}</span>{" "}
                    <span className="text-muted-foreground">— {acct.note}</span>
                  </span>
                  <span className="font-mono text-muted-foreground">{acct.email}</span>
                </button>
              ))}
              <p className="px-1.5 text-[11px] text-muted-foreground">
                Password for both: <code className="font-mono">{DEMO_PASSWORD}</code> — clicking
                an account fills the form, it does not skip real authentication.
              </p>
            </div>
            <form action={formAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Signing in..." : "Sign in"}
              </Button>
            </form>
            <div className="flex items-center justify-center gap-4 border-t pt-4 text-xs text-muted-foreground">
              <a href="/about" className="inline-flex items-center gap-1.5 hover:text-foreground">
                <Info className="size-3.5" aria-hidden />
                What is this?
              </a>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 hover:text-foreground"
              >
                <Code2 className="size-3.5" aria-hidden />
                Source on GitHub
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
