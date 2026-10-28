"use client";

import { Fragment } from "react";
import type { Ticket } from "@prisma/client";
import { Zap } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

const PRIORITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  LOW: "outline",
  MEDIUM: "secondary",
  HIGH: "default",
  URGENT: "destructive",
};

// Highlights the exact substring the AI claimed as its grounding quote within the full raw
// message, so the "grounded on" claim is something you can actually see, not just read.
function highlightSnippet(rawText: string, snippet: string | null) {
  if (!snippet || !rawText.includes(snippet)) return rawText;
  const idx = rawText.indexOf(snippet);
  return (
    <Fragment>
      {rawText.slice(0, idx)}
      <mark className="rounded bg-primary/20 px-0.5 text-foreground">{snippet}</mark>
      {rawText.slice(idx + snippet.length)}
    </Fragment>
  );
}

export function TicketDetailSheet({
  ticket,
  trigger,
}: {
  ticket: Ticket;
  trigger: React.ReactElement;
}) {
  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent className="top-0 right-0 left-auto h-full max-w-[calc(100%-2rem)] translate-x-0 translate-y-0 overflow-y-auto rounded-none sm:max-w-sm">
        <DialogTitle className="flex items-center gap-2">
          via {ticket.source} · {formatDateTime(ticket.createdAt)}
        </DialogTitle>
        <div id="ticket-detail-description" className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-1.5">
              {ticket.classification ? (
                <Badge>{ticket.classification.replace(/_/g, " ")}</Badge>
              ) : (
                <Badge variant="outline">unclassified</Badge>
              )}
              {ticket.priority ? (
                <Badge variant={PRIORITY_VARIANT[ticket.priority]}>{ticket.priority}</Badge>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground">Original message</p>
              <p className="rounded-md border bg-muted/30 p-3 leading-relaxed text-foreground">
                {highlightSnippet(ticket.rawText, ticket.sourceSnippet)}
              </p>
              {ticket.sourceSnippet ? (
                <p className="text-xs text-muted-foreground">
                  Highlighted text is the exact quote the model cited as grounding for this
                  classification.
                </p>
              ) : null}
            </div>

            {ticket.summary ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-foreground">AI summary</p>
                <p className="text-muted-foreground">{ticket.summary}</p>
              </div>
            ) : null}

            {ticket.confidence !== null ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-foreground">Confidence</p>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.round(ticket.confidence * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-foreground">
                    {Math.round(ticket.confidence * 100)}%
                  </span>
                </div>
              </div>
            ) : null}

            <div className="space-y-1 rounded-md border-l-2 border-primary bg-primary/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Zap className="size-3.5 text-primary" aria-hidden />
                Automation
              </p>
              <p className="text-xs text-muted-foreground">
                This ticket&apos;s creation ran against every active rule on{" "}
                <a href="/automations" className="underline underline-offset-2 hover:text-foreground">
                  /automations
                </a>{" "}
                — check the run history there for exactly what matched.
              </p>
            </div>
        </div>
        <DialogClose className="mt-2 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
          Close
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
