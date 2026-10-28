"use client";

import { useActionState } from "react";
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

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);
  const demoHint = process.env.NEXT_PUBLIC_DEMO_HINT;

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
          <ul className="space-y-3">
            {PITCH_POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                {text}
              </li>
            ))}
          </ul>
          <p className="text-sm font-medium text-foreground">
            This isn&apos;t a mockup — the dates span a simulated month of business, but every
            classification and automation run behind them was produced by the app&apos;s real
            code, refreshed daily by a cron job (see{" "}
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
            <CardDescription>
              Field-service ops automation + AI reporting demo.
              {demoHint ? (
                <span className="mt-2 block text-xs text-muted-foreground">
                  Demo password: <code className="font-mono">{demoHint}</code>
                </span>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form action={formAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" name="password" type="password" required autoFocus />
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
