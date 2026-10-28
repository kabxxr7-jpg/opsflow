"use client";

import { useActionState } from "react";
import { login } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);
  const demoHint = process.env.NEXT_PUBLIC_DEMO_HINT;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Opsflow</CardTitle>
          <CardDescription>
            Field-service ops automation + AI reporting demo.
            {demoHint ? (
              <span className="mt-2 block text-xs text-muted-foreground">
                Demo password: <code className="font-mono">{demoHint}</code>
              </span>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
}
