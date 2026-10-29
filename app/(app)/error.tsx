"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

// Catches anything genuinely unexpected on a page (a database hiccup, a bug). Expected failures
// — validation, permissions, a stale id — never get here: Server Actions return them as messages.
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center" role="alert">
      <TriangleAlert className="size-8 text-muted-foreground" aria-hidden />
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-medium tracking-tight">Something went wrong</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          This page hit an unexpected error. Nothing you did caused it, and your data is untouched. Try again — if it
          keeps happening, reload the page.
        </p>
        {error.digest ? <p className="font-mono text-xs text-muted-foreground">Reference: {error.digest}</p> : null}
      </div>
      <Button type="button" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
